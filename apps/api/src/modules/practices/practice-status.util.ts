import { PracticeStatus } from '@prisma/client';

/**
 * Documento mínimo necesario para derivar el estado de una práctica.
 */
export interface StatusRelevantDoc {
  documentType: string | null;
  status: string;
  signatureStatus?: string | null;
}

/**
 * Estados que NUNCA se derivan automáticamente: representan decisiones
 * humanas que el sistema no puede inferir de los documentos.
 *  - REJECTED: la empresa o una autoridad rechazó al estudiante.
 *  - CANCELED: la práctica se dio de baja.
 */
export const MANUAL_STATUSES: PracticeStatus[] = ['REJECTED', 'CANCELED'];

/** Cómo se nombra cada estado de cara al usuario. Fuente única del rótulo. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  PENDING: 'No iniciado',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Finalizado',
  CANCELED: 'Cancelado',
  REJECTED: 'Rechazado',
  // Ya no se deriva; se conserva por si quedan filas antiguas.
  DELAYED: 'Atrasado',
};

/**
 * Deriva el estado de una práctica a partir de HECHOS verificables
 * (documentos emitidos y firmas), no de datos escritos a mano.
 *
 * El recorrido documental tiene tres momentos, y el estado dice en cuál está:
 *
 *   PENDING     → «No iniciado». Sus datos están cargados y asignados, pero
 *                 todavía no se le ha generado ningún documento.
 *   IN_PROGRESS → «En proceso». Ya se generó al menos uno: el trámite arrancó.
 *   COMPLETED   → «Finalizado». Tiene los tres documentos vigentes —solicitud,
 *                 designación y certificado— y el certificado está suscrito por
 *                 las dos autoridades.
 *
 * DELAYED quedó fuera a propósito: dependía de `endDate`, un dato que el
 * sistema no recoge en ningún flujo (ni el formulario ni la importación de
 * Excel lo piden), de modo que la condición no podía cumplirse nunca. Se
 * conserva en el enum por las filas históricas, pero ya no se deriva.
 *
 * Ojo con el ciclo: COMPLETED es la consecuencia de tener el certificado
 * firmado, así que emitir el certificado NO puede exigir estar COMPLETED.
 */
export function derivePracticeStatus(
  practice: { status: PracticeStatus },
  docs: StatusRelevantDoc[],
): PracticeStatus {
  // Las decisiones humanas mandan sobre cualquier derivación
  if (MANUAL_STATUSES.includes(practice.status)) return practice.status;

  const certificadoFirmado = docs.some(
    (d) => d.documentType === 'CERTIFICADO' && d.status === 'VALID' && d.signatureStatus === 'SIGNED',
  );

  // Finalizado es tener el certificado firmado, y nada más. Antes exigía además
  // solicitud y designación vigentes, con lo que una práctica ya certificada y
  // firmada se quedaba en «En proceso» para siempre si la empresa nunca recibió
  // una solicitud. El certificado se emite contra el acta del docente; si está
  // firmado, la práctica culminó.
  if (certificadoFirmado) return 'COMPLETED';

  // Basta con que se haya generado algún documento, aunque después se anulara:
  // una práctica cuya solicitud se invalidó ya arrancó, y lo que necesita es
  // rehacerla, no aparecer como si nadie la hubiera tocado.
  if (docs.length > 0) return 'IN_PROGRESS';

  return 'PENDING';
}

/**
 * ¿Se puede emitir el certificado de culminación?
 *
 * Requiere la designación vigente, el acta del docente y los datos que el
 * documento imprime. NO exige la solicitud: es un trámite previo y colectivo
 * que puede no existir. NO exige status COMPLETED: ese estado es justamente la
 * consecuencia de tener el certificado ya firmado.
 */
export function canIssueCertificate(
  practice: {
    totalHours: number;
    tutorName?: string | null;
    practiceLevel?: string | null;
    academicLevel?: string | null;
    status: PracticeStatus;
    // Aprobacion del tutor por acta de calificaciones (RF-18). Es opcional en
    // el tipo para que los llamadores antiguos sigan compilando, pero quien no
    // la seleccione recibira el rechazo: se comprueba abajo igual.
    tutorApprovedAt?: Date | null;
    closedAt?: Date | null;
  },
  docs: StatusRelevantDoc[],
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  if (MANUAL_STATUSES.includes(practice.status)) {
    missing.push(practice.status === 'REJECTED' ? 'la práctica fue rechazada' : 'la práctica está cancelada');
    return { ok: false, missing };
  }

  // Ya tiene certificado vigente: no se emite un duplicado. Para rehacerlo
  // hay que invalidar el actual primero (deja rastro de por qué se reemplazó).
  const hasValidCertificate = docs.some(
    (d) => d.documentType === 'CERTIFICADO' && d.status === 'VALID',
  );
  if (hasValidCertificate) {
    missing.push('ya tiene un certificado vigente (invalídalo si necesitas reemplazarlo)');
    return { ok: false, missing };
  }

  // La DESIGNACIÓN es obligatoria; la SOLICITUD no.
  //
  // Los dos son oficios de la etapa de planificación del PAP-01, pero no
  // acreditan lo mismo. La solicitud pide vacantes a la empresa para un grupo:
  // es previa, colectiva, y puede no existir, porque el cupo se acuerda a
  // veces de palabra. Bloquear por ella dejaba sin certificado a estudiantes
  // que sí habían culminado, y por eso se dejó de exigir.
  //
  // La designación es otra cosa: es la que nombra A ESTE estudiante, le asigna
  // SU tutor y fija sus horas y su nivel. Es el acto por el que la práctica
  // existe a nombre de alguien. Certificar sin ella sería acreditar una
  // práctica que nunca se asignó formalmente, y además el certificado imprime
  // tutor, horas y nivel: justo lo que la designación establece.
  const tieneDesignacion = docs.some(
    (d) => d.documentType === 'DESIGNACION' && d.status === 'VALID',
  );
  if (!tieneDesignacion) missing.push('la designación de estudiante y tutor');

  if (!practice.totalHours || practice.totalHours <= 0) missing.push('horas totales (> 0)');
  if (!practice.tutorName?.trim()) missing.push('tutor asignado');
  if (!practice.practiceLevel?.trim()) missing.push('nivel de práctica');
  if (!practice.academicLevel?.trim()) missing.push('nivel académico');

  // El certificado acredita que la práctica se culminó, y quien lo sabe es el
  // docente que la calificó. La marca viene del acta de calificaciones que la
  // coordinación carga al cerrar el período: sin ella el sistema estaría
  // certificando por su cuenta algo que nadie evaluó.
  if (!practice.tutorApprovedAt) missing.push('la aprobación del tutor (acta de calificaciones)');

  return { ok: missing.length === 0, missing };
}

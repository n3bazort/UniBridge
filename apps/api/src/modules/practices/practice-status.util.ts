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

/**
 * Deriva el estado de una práctica a partir de HECHOS verificables
 * (documentos emitidos y firmas), no de datos escritos a mano.
 *
 *   PENDING     → todavía no hay solicitud vigente: no arrancó formalmente.
 *   IN_PROGRESS → hay solicitud vigente pero el certificado aún no tiene
 *                 las dos firmas (incluye "en circuito de firma").
 *   COMPLETED   → el certificado está firmado por Decano y Director.
 *   DELAYED     → sigue en curso pero su fecha de fin ya pasó.
 *
 * Ojo con el ciclo: COMPLETED significa "ya tiene su certificado firmado",
 * por eso emitir el certificado NO puede exigir estar COMPLETED. El requisito
 * para emitir es tener solicitud vigente + los datos que se imprimen.
 */
export function derivePracticeStatus(
  practice: { status: PracticeStatus; endDate?: Date | null },
  docs: StatusRelevantDoc[],
): PracticeStatus {
  // Las decisiones humanas mandan sobre cualquier derivación
  if (MANUAL_STATUSES.includes(practice.status)) return practice.status;

  const hasValidSolicitud = docs.some(
    (d) => d.documentType === 'SOLICITUD' && d.status === 'VALID',
  );
  const hasSignedCertificate = docs.some(
    (d) => d.documentType === 'CERTIFICADO' && d.status === 'VALID' && d.signatureStatus === 'SIGNED',
  );

  if (hasSignedCertificate) return 'COMPLETED';
  if (!hasValidSolicitud) return 'PENDING';

  // En curso: si además se pasó de la fecha de fin, se marca atrasada
  if (practice.endDate && practice.endDate < new Date()) return 'DELAYED';

  return 'IN_PROGRESS';
}

/**
 * ¿Se puede emitir el certificado de culminación?
 * Requiere solicitud vigente (el proceso arrancó formalmente) y los datos
 * que se imprimen en el documento. NO exige status COMPLETED: ese estado
 * es justamente la consecuencia de tener el certificado ya firmado.
 */
export function canIssueCertificate(
  practice: { totalHours: number; tutorName?: string | null; practiceLevel?: string | null; academicLevel?: string | null; status: PracticeStatus },
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

  const hasValidSolicitud = docs.some(
    (d) => d.documentType === 'SOLICITUD' && d.status === 'VALID',
  );
  if (!hasValidSolicitud) missing.push('solicitud de prácticas vigente');
  if (!practice.totalHours || practice.totalHours <= 0) missing.push('horas totales (> 0)');
  if (!practice.tutorName?.trim()) missing.push('tutor asignado');
  if (!practice.practiceLevel?.trim()) missing.push('nivel de práctica');
  if (!practice.academicLevel?.trim()) missing.push('nivel académico');

  return { ok: missing.length === 0, missing };
}

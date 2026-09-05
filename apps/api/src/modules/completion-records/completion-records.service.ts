import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';
import { leerActaPdf, ActaLeida } from './acta.parser';
import { assertPeriodoAbierto } from '../academic-periods/period.util';

/** Un estudiante que el acta aprueba y que sí tiene práctica abierta aquí. */
export interface Listo {
  dni: string;
  nombreActa: string;
  studentId: string;
  practiceId: string;
  nombre: string;
  empresa: string | null;
  tutorActual: string | null;
}

export interface RevisionActa {
  cabecera: ActaLeida['cabecera'];
  /** Avisos sobre el acta entera: período que no cuadra, docente que no cuadra. */
  advertencias: string[];
  /** Se marcarán como aprobados al confirmar. */
  listos: Listo[];
  /** Aparecen en el acta pero NO aprueban. */
  reprobados: Array<{ dni: string; nombreActa: string; condicion: string }>;
  /** Cédulas que no corresponden a ningún estudiante registrado. */
  desconocidos: Array<{ dni: string; nombreActa: string }>;
  /** Estudiantes registrados pero sin práctica abierta en este período. */
  sinPractica: Array<{ dni: string; nombre: string; motivo: string }>;
  /** Ya estaban aprobados: confirmar de nuevo no cambia nada. */
  yaAprobados: Array<{ dni: string; nombre: string; aprobadoEl: Date; porTutor: string | null }>;
}

/** Días que se conserva el acta antes de que la purga la retire. */
const DIAS_DE_GUARDA = 30;

@Injectable()
export class CompletionRecordsService implements OnModuleInit {
  private readonly logger = new Logger(CompletionRecordsService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  /**
   * Barrido diario de actas vencidas, con la misma cadencia que la papelera de
   * documentos. Arranca a los dos minutos y no al minuto para no coincidir con
   * ella: son dos recorridos del almacen y no hay prisa por ninguno.
   */
  onModuleInit() {
    setTimeout(() => this.purgar().catch((e) => this.logger.error('Purga inicial de actas fallo', e)), 120_000);
    setInterval(() => this.purgar().catch((e) => this.logger.error('Purga diaria de actas fallo', e)), 24 * 60 * 60 * 1000);
  }

  /** Nombre normalizado: sin tildes, sin mayúsculas, sin espacios de más. */
  private clave(nombre: string) {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private async resolverFacultad(facultyId?: string): Promise<string> {
    if (facultyId) return facultyId;
    const facultades = await this.prisma.faculty.findMany({
      where: { deletedAt: null }, select: { id: true }, take: 2,
    });
    if (facultades.length === 1) return facultades[0].id;
    if (facultades.length === 0) throw new BadRequestException('No hay ninguna facultad registrada');
    throw new BadRequestException(
      'Hay varias facultades: inicia sesión con una cuenta de coordinación para registrar actas',
    );
  }

  private async periodoActivo(): Promise<string> {
    const p = await this.prisma.academicPeriod.findFirst({ where: { isActive: true }, select: { code: true } });
    if (!p) {
      throw new BadRequestException(
        'No hay ningún período académico activo. Marca el período en curso como activo en Configuración.',
      );
    }
    return p.code;
  }

  /**
   * Busca a qué docente registrado corresponde el nombre que imprime el acta.
   *
   * El acta lo escribe en orden APELLIDOS NOMBRES y sin título («SANTANA
   * CEDEÑO HIRAIDA MONSERRATE»), mientras el sistema lo guarda al revés y con
   * título («Ing. Hiraida Monserrate Santana Cedeño. Mg.»). Comparar las
   * cadenas no sirve; comparar los conjuntos de palabras, sí.
   *
   * Es la ÚNICA forma de atribuir la aprobación. Antes existía además un
   * desplegable para elegir al docente a mano, que permitía registrar el acta
   * a nombre de alguien distinto del que la firma; se quitó por eso.
   */
  private async reconocerTutor(facultyId: string, professorRaw?: string | null) {
    if (!professorRaw?.trim()) return null;

    const palabrasActa = new Set(
      this.clave(professorRaw).split(' ').filter((p) => p.length > 2),
    );
    if (palabrasActa.size === 0) return null;

    const tutores = await this.prisma.tutor.findMany({
      where: { facultyId, deletedAt: null },
      select: { id: true, fullName: true },
    });

    // Los títulos («ING», «MG», «PHD») no distinguen a nadie: fuera.
    const TITULOS = new Set(['ING', 'LIC', 'MSC', 'PHD', 'DRA', 'ABG', 'ECO', 'PSC']);

    let mejor: { id: string; fullName: string; coincidencias: number } | null = null;
    for (const t of tutores) {
      const palabras = this.clave(t.fullName)
        .split(' ')
        .filter((p) => p.length > 2 && !TITULOS.has(p));
      const coincidencias = palabras.filter((p) => palabrasActa.has(p)).length;
      if (coincidencias >= 3 && (!mejor || coincidencias > mejor.coincidencias)) {
        mejor = { id: t.id, fullName: t.fullName, coincidencias };
      }
    }
    // Se exigen tres apellidos/nombres en común: con dos, dos hermanos
    // docentes de la misma facultad se confundirían entre sí.
    return mejor;
  }

  /**
   * Lee el acta y arma la revisión, SIN escribir nada.
   *
   * Todo lo que decide se enseña antes de confirmar: es la pantalla la que
   * evita aprobar a quien no tocaba.
   */
  async previsualizar(
    archivo: { originalname: string; buffer: Buffer } | undefined,
    opciones: { academicPeriod?: string },
    facultyIdUsuario?: string,
  ): Promise<RevisionActa & { tutorSugerido: { id: string; fullName: string } | null }> {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const periodo = opciones.academicPeriod || (await this.periodoActivo());

    // El acta en PDF es el único origen. Antes se admitía además una lista de
    // cédulas pegadas a mano, que se daban por aprobadas sin poder comprobar
    // nada: sin la columna «Condición» del acta, el sistema no verificaba la
    // aprobación, solo la transcribía. Eso no es un acta, es una afirmación.
    if (!archivo) {
      throw new BadRequestException('Adjunta el acta de calificaciones en PDF.');
    }
    if (!/\.pdf$/i.test(archivo.originalname)) {
      throw new BadRequestException(
        'El acta debe ser el PDF que emite Secretaría General, no una foto ni un escaneo.',
      );
    }

    let leida: ActaLeida;
    try {
      leida = await leerActaPdf(archivo.buffer);
    } catch (e: any) {
      this.logger.warn(`No se pudo leer el acta ${archivo.originalname}: ${e.message}`);
      throw new BadRequestException(
        'No se pudo leer el PDF. Comprueba que sea el acta de calificaciones y no una foto o un escaneo: ' +
        'el lector necesita el texto del documento, no una imagen.',
      );
    }

    if (leida.filas.length === 0) {
      throw new BadRequestException(
        'No se reconoció ninguna fila de estudiante en el acta. ' +
        (leida.descartadas.length
          ? `Se encontraron ${leida.descartadas.length} línea(s) con cédula pero sin la columna «Condición»: puede que el formato del acta haya cambiado.`
          : 'Comprueba que sea el acta de calificaciones correcta.'),
      );
    }

    // ── Avisos sobre el acta entera ──
    const advertencias: string[] = [];
    const tutorSugerido = await this.reconocerTutor(facultyId, leida.cabecera.professorRaw);

    if (leida.cabecera.academicPeriod && leida.cabecera.academicPeriod !== periodo) {
      advertencias.push(
        `El acta es del período ${leida.cabecera.academicPeriod} y estás registrando en ${periodo}. ` +
        'Comprueba que sea el acta que querías cargar.',
      );
    }
    // La aprobación queda a nombre del docente que FIRMA el acta, reconocido en
    // su cabecera. Si no se le reconoce, no hay a quién atribuirla: antes se
    // podía elegir a otro docente en un desplegable, lo que permitía que un
    // acta quedara registrada a nombre de quien no la firmó.
    if (!tutorSugerido) {
      advertencias.push(
        leida.cabecera.professorRaw
          ? `«${leida.cabecera.professorRaw}» no está registrado como docente tutor. Regístralo antes de confirmar: la aprobación queda a nombre de quien firma el acta.`
          : 'No se pudo leer qué docente firma el acta, así que no hay a quién atribuir la aprobación.',
      );
    }
    if (leida.descartadas.length > 0) {
      advertencias.push(
        `${leida.descartadas.length} línea(s) del acta traían una cédula pero no se pudieron interpretar como fila de estudiante.`,
      );
    }

    // ── Reparto en grupos ──
    const aprueban = leida.filas.filter((f) => f.aprueba);
    const reprobados = leida.filas
      .filter((f) => !f.aprueba)
      .map((f) => ({ dni: f.dni, nombreActa: f.nombre, condicion: f.condicion }));

    const estudiantes = await this.prisma.student.findMany({
      where: { dni: { in: aprueban.map((f) => f.dni) }, deletedAt: null },
      select: {
        id: true, dni: true, firstName: true, lastName: true,
        practices: {
          where: { academicPeriod: periodo, deletedAt: null },
          select: {
            id: true, closedAt: true, status: true, tutorName: true, tutorApprovedAt: true,
            company: { select: { name: true } },
            approvalTutor: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    const porDni = new Map(estudiantes.map((e) => [e.dni, e]));

    const listos: RevisionActa['listos'] = [];
    const desconocidos: RevisionActa['desconocidos'] = [];
    const sinPractica: RevisionActa['sinPractica'] = [];
    const yaAprobados: RevisionActa['yaAprobados'] = [];

    for (const fila of aprueban) {
      const e = porDni.get(fila.dni);
      if (!e) {
        desconocidos.push({ dni: fila.dni, nombreActa: fila.nombre });
        continue;
      }
      const nombre = `${e.firstName} ${e.lastName}`;

      const abierta = e.practices.find((p) => !p.closedAt && !['CANCELED', 'REJECTED'].includes(p.status));
      if (!abierta) {
        sinPractica.push({
          dni: fila.dni,
          nombre,
          motivo: e.practices.length === 0
            ? `No tiene práctica registrada en ${periodo}`
            : 'Su práctica de este período está cerrada o dada de baja',
        });
        continue;
      }

      if (abierta.tutorApprovedAt) {
        yaAprobados.push({
          dni: fila.dni, nombre,
          aprobadoEl: abierta.tutorApprovedAt,
          porTutor: abierta.approvalTutor?.fullName ?? null,
        });
        continue;
      }

      listos.push({
        dni: fila.dni,
        nombreActa: fila.nombre,
        studentId: e.id,
        practiceId: abierta.id,
        nombre,
        empresa: abierta.company?.name ?? null,
        tutorActual: abierta.tutorName,
      });
    }

    return {
      cabecera: leida.cabecera,
      advertencias, listos, reprobados, desconocidos, sinPractica, yaAprobados,
      tutorSugerido: tutorSugerido ? { id: tutorSugerido.id, fullName: tutorSugerido.fullName } : null,
    };
  }

  /**
   * Registra el acta y marca como aprobados a los que se confirmen.
   *
   * Se vuelve a leer el archivo en lugar de fiarse de la lista que envía la
   * pantalla: así nadie puede aprobar por petición directa a un estudiante que
   * el acta no aprueba. Lo que la pantalla decide es a cuáles de los que el
   * acta aprueba se les registra, nunca añadir a quien no estaba.
   */
  async confirmar(
    archivo: { originalname: string; buffer: Buffer } | undefined,
    dto: { academicPeriod?: string; practiceIds?: string[] },
    usuarioId: string,
    facultyIdUsuario?: string,
  ) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const periodo = dto.academicPeriod || (await this.periodoActivo());

    // Registrar una aprobación es escribir, así que el período tiene que estar
    // abierto. Se comprueba ANTES de leer el acta: gastar la lectura de un PDF
    // para acabar rechazando por el período sería trabajo tirado.
    await assertPeriodoAbierto(this.prisma, periodo, 'registrar la aprobación de un tutor');

    const revision = await this.previsualizar(archivo, { academicPeriod: periodo }, facultyIdUsuario);

    // El docente sale del acta, no de una selección. Si su cabecera no
    // corresponde a ningún docente registrado, no hay a quién atribuir la
    // aprobación y no se escribe nada.
    if (!revision.tutorSugerido) {
      throw new BadRequestException(
        'No se pudo determinar qué docente firma el acta, así que no hay a quién atribuir la aprobación. ' +
        'Regístralo como docente tutor y vuelve a cargarla.',
      );
    }

    const tutor = await this.prisma.tutor.findFirst({
      where: { id: revision.tutorSugerido.id, facultyId, deletedAt: null },
    });
    if (!tutor) throw new NotFoundException('El docente que firma el acta no existe en esta facultad');

    // El acta la firma un docente que lleva estudiantes en ese período; si no
    // lleva a ninguno, su aprobación no acredita nada.
    const suyas = await this.prisma.practice.count({
      where: { tutorId: tutor.id, academicPeriod: periodo, deletedAt: null },
    });
    if (suyas === 0) {
      throw new BadRequestException(
        `«${tutor.fullName}» firma el acta pero no tiene estudiantes asignados en el período ${periodo}, ` +
        'así que no puede aprobar a nadie en él.',
      );
    }

    // Sin selección explícita se aprueban todos los del primer grupo.
    const pedidos = dto.practiceIds?.length ? new Set(dto.practiceIds) : null;
    const aRegistrar = pedidos
      ? revision.listos.filter((l) => pedidos.has(l.practiceId))
      : revision.listos;

    if (aRegistrar.length === 0) {
      throw new BadRequestException(
        'No hay ningún estudiante que aprobar. ' +
        (revision.listos.length === 0
          ? 'Ninguno de los que aprueba el acta tiene práctica abierta pendiente en este período.'
          : 'No se seleccionó a ninguno de los estudiantes disponibles.'),
      );
    }

    // El archivo se guarda para poder revisar una aprobación reciente. Vive 30
    // días: el acta ya está en el sistema académico y guardarla dos veces es
    // duplicar sin motivo. La purga programada la retira junto con su archivo.
    let fileKey: string | null = null;
    if (archivo) {
      const limpio = archivo.originalname.replace(/[^\w.\-]+/g, '_');
      const objectKey = `actas/${periodo}/${Date.now()}_${limpio}`;
      try {
        fileKey = await this.minio.uploadBuffer(archivo.buffer, objectKey, 'application/pdf');
      } catch (e: any) {
        // Que no se pueda archivar el PDF no debe impedir la aprobación: el
        // dato que importa es la marca en la práctica, y el acta original
        // sigue estando en el sistema académico.
        this.logger.warn(`No se pudo archivar el acta ${objectKey}: ${e.message}`);
      }
    }

    const purgeAt = new Date();
    purgeAt.setDate(purgeAt.getDate() + DIAS_DE_GUARDA);

    const ahora = new Date();
    const { cabecera } = revision;

    const registro = await this.prisma.$transaction(async (tx) => {
      const acta = await tx.completionRecord.create({
        data: {
          facultyId,
          academicPeriod: periodo,
          tutorId: tutor.id,
          fileKey,
          fileName: archivo?.originalname ?? null,
          totalDnis: revision.listos.length + revision.reprobados.length +
                     revision.desconocidos.length + revision.sinPractica.length +
                     revision.yaAprobados.length,
          matchedCount: aRegistrar.length,
          uploadedById: usuarioId,
          purgeAt,
          actaNumber: cabecera.actaNumber,
          actaVersion: cabecera.actaVersion,
          subject: cabecera.subject,
          courseCode: cabecera.courseCode,
          level: cabecera.level,
          parallel: cabecera.parallel,
          professorRaw: cabecera.professorRaw,
        },
      });

      await tx.practice.updateMany({
        where: { id: { in: aRegistrar.map((l) => l.practiceId) } },
        data: {
          tutorApprovedAt: ahora,
          approvalTutorId: tutor.id,
          approvalRegisteredById: usuarioId,
          completionRecordId: acta.id,
        },
      });

      return acta;
    });

    return {
      completionRecordId: registro.id,
      aprobados: aRegistrar.length,
      tutor: tutor.fullName,
      academicPeriod: periodo,
      estudiantes: aRegistrar.map((l) => ({ nombre: l.nombre, dni: l.dni })),
      omitidos: {
        reprobados: revision.reprobados.length,
        desconocidos: revision.desconocidos.length,
        sinPractica: revision.sinPractica.length,
        yaAprobados: revision.yaAprobados.length,
      },
      advertencias: revision.advertencias,
    };
  }

  /** Actas registradas, para poder responder «¿quién aprobó a este y cuándo?». */
  async findAll(facultyIdUsuario?: string, academicPeriod?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    return this.prisma.completionRecord.findMany({
      where: { facultyId, ...(academicPeriod ? { academicPeriod } : {}) },
      include: {
        tutor: { select: { id: true, fullName: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { approvedPractices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Descarga del acta archivada, mientras siga dentro de sus 30 días. */
  async getDownloadUrl(id: string, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const acta = await this.prisma.completionRecord.findFirst({ where: { id, facultyId } });
    if (!acta) throw new NotFoundException('El acta no existe');
    if (!acta.fileKey) {
      throw new NotFoundException(
        'El acta ya se purgó. Descárgala del sistema académico con su número: ' + (acta.actaNumber ?? 's/n'),
      );
    }
    const url = await this.minio.getPresignedUrl(acta.fileKey, 900, acta.fileName ?? undefined);
    return { url, fileName: acta.fileName };
  }

  /**
   * Retira las actas que ya cumplieron sus 30 días.
   *
   * La marca de aprobación en la práctica NO se toca: lo que caduca es la
   * copia del archivo, no el hecho de que el tutor aprobó. Se conservan el
   * número y la versión del acta, que es lo que hace falta para volver a
   * pedirla al sistema académico.
   */
  async purgar() {
    const vencidas = await this.prisma.completionRecord.findMany({
      where: { purgeAt: { lte: new Date() }, fileKey: { not: null } },
      select: { id: true, fileKey: true },
    });
    if (vencidas.length === 0) return { purgadas: 0 };

    let archivosBorrados = 0;
    for (const acta of vencidas) {
      try {
        await this.minio.removeObject(acta.fileKey as string);
        archivosBorrados++;
      } catch (e: any) {
        this.logger.warn(`No se pudo borrar el acta ${acta.fileKey}: ${e.message}`);
      }
      await this.prisma.completionRecord.update({
        where: { id: acta.id },
        data: { fileKey: null },
      });
    }

    this.logger.log(`Purga de actas: ${archivosBorrados} archivo(s) retirados de ${vencidas.length} vencida(s).`);
    return { purgadas: vencidas.length, archivosBorrados };
  }
}

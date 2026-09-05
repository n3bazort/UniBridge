import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';

/**
 * Repositorio público: el estudiante consulta sus documentos con su cédula,
 * sin cuenta (RF-27).
 *
 * ── Lo que este módulo NO hace, a propósito ──
 *
 * La cédula es el único dato que se pide, y eso significa que cualquiera que
 * conozca una cédula ajena vería esos documentos. Es una decisión tomada a
 * sabiendas —el estudiante no tiene cuenta en el sistema y crearle una para
 * que descargue su propio certificado sería desproporcionado—, así que lo que
 * queda es acotar el daño:
 *
 *   · Coincidencia EXACTA. No hay búsqueda parcial ni por nombre, así que no
 *     se puede recorrer el padrón probando prefijos.
 *   · Sin listados. No existe ningún camino que devuelva más de un estudiante.
 *   · Solo documentos VIGENTES. Un documento anulado no se publica: fuera de
 *     contexto acreditaría algo que dejó de ser cierto.
 *   · El nombre se devuelve recortado, lo justo para que quien consulta
 *     confirme que acertó con la cédula y no para construir un directorio.
 *   · Enlaces de descarga de quince minutos, como en el resto del sistema.
 *
 * El límite de intentos por minuto lo pone el controlador.
 */

/** Lo que se publica de cada documento. Nada más que esto sale del servidor. */
export interface DocumentoPublico {
  id: string;
  codigo: string | null;
  tipo: string | null;
  nombre: string;
  emitidoEl: Date;
  firmado: boolean;
  firmadoEl: Date | null;
}

/** @see el bloque de arriba: por qué esto no pide más que la cédula. */
@Injectable()
export class PublicRepositoryService {
  private readonly logger = new Logger(PublicRepositoryService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  /** Nombre para mostrar: iniciales de los nombres, apellidos completos. */
  private nombreRecortado(firstName: string, lastName: string) {
    const iniciales = firstName
      .trim()
      .split(/\s+/)
      .map((n) => `${n.charAt(0).toUpperCase()}.`)
      .join(' ');
    return `${iniciales} ${lastName}`.trim();
  }

  private nombreDelTipo(tipo?: string | null) {
    switch (tipo) {
      case 'SOLICITUD': return 'Solicitud de prácticas';
      case 'DESIGNACION': return 'Designación de estudiantes';
      case 'CERTIFICADO': return 'Certificado de culminación';
      default: return 'Documento';
    }
  }

  /**
   * Documentos vigentes de un estudiante, buscados por cédula exacta.
   *
   * Devuelve lo mismo —una lista vacía— tanto si la cédula no existe como si
   * existe y no tiene documentos: distinguir los dos casos convertiría esto en
   * un comprobador de cédulas matriculadas.
   */
  async consultarPorCedula(dni: string) {
    const limpia = (dni ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(limpia)) {
      throw new BadRequestException('La cédula debe tener exactamente diez dígitos');
    }

    const estudiante = await this.prisma.student.findFirst({
      where: { dni: limpia, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true,
        program: { select: { name: true } },
        generatedDocs: {
          where: { status: 'VALID', deletedAt: null },
          select: {
            id: true, documentCode: true, documentType: true, createdAt: true,
            signatureStatus: true, signedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!estudiante) return { encontrado: false, documentos: [] as DocumentoPublico[] };

    return {
      encontrado: true,
      estudiante: {
        nombre: this.nombreRecortado(estudiante.firstName, estudiante.lastName),
        carrera: estudiante.program?.name ?? null,
      },
      documentos: estudiante.generatedDocs.map((d) => ({
        id: d.id,
        codigo: d.documentCode,
        tipo: d.documentType,
        nombre: this.nombreDelTipo(d.documentType),
        emitidoEl: d.createdAt,
        firmado: d.signatureStatus === 'SIGNED',
        firmadoEl: d.signedAt,
      })),
    };
  }

  /**
   * Enlace de descarga de un documento concreto.
   *
   * Se exige la cédula otra vez, y tiene que ser la del dueño: sin eso, el
   * identificador del documento por sí solo abriría el de cualquiera.
   */
  async descargar(documentId: string, dni: string) {
    const limpia = (dni ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(limpia)) {
      throw new BadRequestException('La cédula debe tener exactamente diez dígitos');
    }

    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id: documentId, status: 'VALID', deletedAt: null, student: { dni: limpia, deletedAt: null } },
      select: {
        id: true, fileUrl: true, signedFileKey: true, documentCode: true, documentType: true,
        student: { select: { lastName: true, firstName: true } },
      },
    });
    // El mismo mensaje para «no existe» y para «no es tuyo»: separarlos diría
    // que el documento existe, que es justo lo que no toca revelar.
    if (!doc) throw new NotFoundException('No se encontró ese documento para esa cédula');

    // Se entrega la versión firmada cuando la hay: es la que tiene valor.
    const key = doc.signedFileKey || doc.fileUrl;
    if (!key) throw new NotFoundException('El documento no tiene archivo asociado');

    const extension = key.toLowerCase().endsWith('.pdf') ? '.pdf' : '.docx';
    const nombreArchivo =
      `${this.nombreDelTipo(doc.documentType)} ${doc.documentCode ?? ''}`.trim().replace(/\s+/g, ' ') + extension;

    const url = await this.minio.getPresignedUrl(key, 900, nombreArchivo);
    return { url, fileName: nombreArchivo };
  }

  /**
   * Guarda la designación firmada que devuelve la empresa (RF-27).
   *
   * El oficio sale del sistema, la empresa lo firma y lo sella, y hoy esa
   * copia acaba en una carpeta suelta. Aquí se engancha al documento que la
   * originó, de modo que el respaldo de trazabilidad viva junto a lo que
   * respalda. No sustituye al documento emitido: se guarda aparte y el
   * original conserva su código y su versión.
   */
  async guardarDevuelta(
    documentId: string,
    archivo: { originalname: string; buffer: Buffer },
    usuarioId?: string,
  ) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id: documentId },
      select: { id: true, documentCode: true, documentType: true, status: true, returnedFileKey: true },
    });
    if (!doc) throw new NotFoundException('El documento no existe');
    if (doc.status !== 'VALID') {
      throw new BadRequestException(
        'Ese documento ya no está vigente, así que adjuntarle la copia devuelta no aportaría trazabilidad.',
      );
    }
    if (!/\.(pdf)$/i.test(archivo.originalname)) {
      throw new BadRequestException('La copia devuelta debe ser un PDF: es como la empresa la firma y la escanea');
    }

    const limpio = archivo.originalname.replace(/[^\w.\-]+/g, '_');
    const objectKey = `devueltos/${doc.documentType ?? 'DOC'}/${doc.documentCode ?? doc.id}_${Date.now()}_${limpio}`;
    const guardado = await this.minio.uploadBuffer(archivo.buffer, objectKey, 'application/pdf');

    // A `returnedFileKey`, nunca a `signedFileKey`: ese guarda el PDF con las
    // dos firmas electrónicas y su checksum lo acompaña. Escribir aquí un
    // escaneo dejaría la huella apuntando a un archivo que no es el suyo.
    const actualizado = await this.prisma.generatedDocument.update({
      where: { id: documentId },
      data: {
        returnedFileKey: guardado,
        returnedFileName: archivo.originalname,
        returnedAt: new Date(),
        returnedById: usuarioId ?? null,
      },
      select: { id: true, documentCode: true, returnedFileKey: true, returnedAt: true },
    });

    this.logger.log(`Copia devuelta archivada para ${doc.documentCode ?? doc.id} por ${usuarioId ?? 'sistema'}`);
    return {
      ...actualizado,
      message: `Copia firmada de ${doc.documentCode ?? 'el oficio'} archivada junto al documento que la originó.`,
    };
  }
}

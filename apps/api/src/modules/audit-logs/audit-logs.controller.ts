import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/** Tablas cuyo movimiento no le dice nada a nadie en una bitácora de trámite. */
const RUIDO = ['RefreshToken', 'Session', 'UserToken', 'Unknown', 'AuditLog'];

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Bitácora en crudo' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tableName', required: false, type: String })
  async findAll(@Query('limit') limit?: string, @Query('tableName') tableName?: string) {
    const take = Math.min(parseInt(limit || '20', 10), 100);
    return this.prisma.auditLog.findMany({
      where: { tableName: { notIn: RUIDO }, ...(tableName ? { tableName } : {}) },
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, tableName: true, recordId: true, userId: true, createdAt: true },
    });
  }

  /**
   * La bitácora contada en palabras.
   *
   * El listado en crudo dice «update en Practice, ref a3f9b201», que no le sirve
   * a nadie: hay que saber QUIÉN movió a QUIÉN y POR QUÉ. Aquí cada entrada se
   * resuelve contra su registro —el estudiante, la empresa, el motivo de la
   * baja— y se devuelve ya redactada.
   *
   * `academicPeriod` acota a las prácticas de ese semestre; lo que no pertenece
   * a ninguno (empresas, plantillas, cuentas) se incluye siempre, porque afecta
   * a todos por igual.
   */
  @Get('feed')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Actividad reciente, ya redactada y con su autor' })
  @ApiQuery({ name: 'academicPeriod', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async feed(
    @Query('academicPeriod') academicPeriod?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(parseInt(limit || '10', 10), 50);
    const skip = Math.max(parseInt(offset || '0', 10), 0);

    // Se pide de más porque el filtro por período descarta entradas: pedir
    // justo `take` dejaría páginas cortas y un «cargar más» que no carga nada.
    const crudos = await this.prisma.auditLog.findMany({
      where: { tableName: { notIn: RUIDO } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take * 4,
      select: { id: true, action: true, tableName: true, recordId: true, userId: true, createdAt: true, newData: true },
    });
    if (crudos.length === 0) return { items: [], hasMore: false, nextOffset: skip };

    // ── Todo lo que hace falta para redactar, en pocas consultas ──
    const ids = (tabla: string) => crudos.filter((l) => l.tableName === tabla).map((l) => l.recordId);

    const [usuarios, practicas, estudiantes, empresas, documentos, motivos] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(crudos.map((l) => l.userId).filter(Boolean))] as string[] } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      }),
      this.prisma.practice.findMany({
        where: { id: { in: ids('Practice') } },
        select: {
          id: true, academicPeriod: true, closedAt: true,
          student: { select: { firstName: true, lastName: true, dni: true } },
          company: { select: { name: true } },
          closureReason: { select: { label: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { id: { in: ids('Student') } },
        select: { id: true, firstName: true, lastName: true, dni: true },
      }),
      this.prisma.company.findMany({
        where: { id: { in: ids('Company') } },
        select: { id: true, name: true },
      }),
      this.prisma.generatedDocument.findMany({
        where: { id: { in: ids('GeneratedDocument') } },
        select: {
          id: true, documentCode: true, documentType: true, status: true,
          student: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.reasonCode.findMany({ select: { id: true, label: true } }),
    ]);

    const mapa = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const mUser = mapa(usuarios), mPrac = mapa(practicas), mEst = mapa(estudiantes);
    const mEmp = mapa(empresas), mDoc = mapa(documentos), mMot = mapa(motivos);

    const nombreDoc: Record<string, string> = {
      SOLICITUD: 'la solicitud', DESIGNACION: 'la designación', CERTIFICADO: 'el certificado',
    };

    const items: any[] = [];
    for (const log of crudos) {
      if (items.length >= take) break;

      const u = log.userId ? mUser.get(log.userId) : null;
      const autor = u
        ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
        : 'El sistema';
      const nuevo = (log.newData ?? {}) as Record<string, any>;

      let texto: string | null = null;
      let tipo = 'otro';
      let periodo: string | null = null;

      if (log.tableName === 'Practice') {
        const p = mPrac.get(log.recordId);
        periodo = p?.academicPeriod ?? null;
        // Si la práctica ya no existe —se borró— no se inventa un sujeto. Decir
        // «un estudiante» suena a un dato que el sistema tiene y no quiere dar;
        // decir que el registro ya no está es la verdad.
        const quien = p ? `${p.student.firstName} ${p.student.lastName}` : 'un registro ya eliminado';
        const donde = p?.company?.name;

        if (log.action === 'create') {
          tipo = 'alta';
          texto = `Registró la práctica de ${quien}${donde ? ` en ${donde}` : ''}`;
        } else if (nuevo.closedAt) {
          // Cerrar por baja y cerrar por reasignación se distinguen por el motivo.
          const motivo = nuevo.closureReasonId ? mMot.get(nuevo.closureReasonId)?.label : p?.closureReason?.label;
          const esMudanza = /cambio de empresa|cambio de tutor/i.test(motivo || '');
          tipo = esMudanza ? 'traslado' : 'baja';
          texto = esMudanza
            ? `Movió a ${quien}${donde ? ` desde ${donde}` : ''} · ${motivo}`
            : `Desvinculó a ${quien}${donde ? ` de ${donde}` : ''}${motivo ? ` · ${motivo}` : ''}`;
        } else if (nuevo.tutorApprovedAt) {
          tipo = 'acta';
          texto = `Registró la aprobación de ${quien} por acta del docente`;
        } else if (nuevo.companyId || nuevo.tutorId || nuevo.tutorName) {
          tipo = 'traslado';
          texto = `Reasignó a ${quien}${donde ? ` · ahora en ${donde}` : ''}`;
        } else if (Object.keys(nuevo).some((k) => !['status', 'updatedAt'].includes(k))) {
          tipo = 'cambio';
          texto = `Editó los datos de ${quien}`;
        }
        // Un `update` que solo toca `status` lo escribe el propio sistema al
        // recalcular el estado desde los documentos. No es actividad de nadie, y
        // llenaba la lista de «Actualizó la práctica de…» sin decir qué cambió.
      } else if (log.tableName === 'GeneratedDocument') {
        const d = mDoc.get(log.recordId);
        const nombre = nombreDoc[d?.documentType ?? ''] ?? 'un documento';
        const quien = d?.student ? `${d.student.firstName} ${d.student.lastName}` : null;
        if (log.action === 'create') {
          tipo = 'documento';
          texto = `Emitió ${nombre}${d?.documentCode ? ` ${d.documentCode}` : ''}${quien ? ` de ${quien}` : ''}`;
        } else if (nuevo.status && nuevo.status !== 'VALID') {
          tipo = 'anulacion';
          const motivo = nuevo.invalidReasonId ? mMot.get(nuevo.invalidReasonId)?.label : null;
          texto = `Anuló ${nombre}${d?.documentCode ? ` ${d.documentCode}` : ''}${motivo ? ` · ${motivo}` : ''}`;
        } else if (nuevo.signatureStatus) {
          tipo = 'firma';
          texto = `${nombre[0].toUpperCase()}${nombre.slice(1)}${d?.documentCode ? ` ${d.documentCode}` : ''} avanzó en el circuito de firma`;
        }
      } else if (log.tableName === 'CompletionRecord' && log.action === 'create') {
        tipo = 'acta';
        periodo = (nuevo.academicPeriod as string) ?? null;
        texto = 'Cargó un acta de calificaciones';
      } else if (log.tableName === 'Student') {
        const e = mEst.get(log.recordId);
        const quien = e ? `${e.firstName} ${e.lastName}` : 'un estudiante';
        if (log.action === 'create') { tipo = 'alta'; texto = `Registró a ${quien}`; }
      } else if (log.tableName === 'Company') {
        const c = mEmp.get(log.recordId);
        if (log.action === 'create') { tipo = 'alta'; texto = `Registró la empresa ${c?.name ?? ''}`.trim(); }
      } else if (log.tableName === 'SignatureBatch' && log.action === 'create') {
        tipo = 'firma';
        texto = 'Envió un lote al circuito de firma';
      } else if (log.tableName === 'AcademicPeriod') {
        tipo = 'periodo';
        texto = log.action === 'create' ? 'Creó un período académico' : 'Cambió la configuración de un período';
      }

      if (!texto) continue;
      // Lo que pertenece a un período se filtra; lo global entra siempre.
      if (academicPeriod && periodo && periodo !== academicPeriod) continue;

      // Un oficio grupal guarda una fila por estudiante, así que anularlo deja
      // cuatro entradas idénticas seguidas. Es UN acto: se muestra una vez, con
      // el número de registros que abarcó.
      const anterior = items[items.length - 1];
      if (anterior && anterior.texto === texto && anterior.autor === autor) {
        anterior.repeticiones = (anterior.repeticiones ?? 1) + 1;
        continue;
      }

      items.push({
        id: log.id,
        tipo,
        texto,
        autor,
        rol: u?.role ?? null,
        fecha: log.createdAt,
        repeticiones: 1,
      });
    }

    return {
      items,
      hasMore: crudos.length > items.length,
      nextOffset: skip + crudos.length,
    };
  }
}

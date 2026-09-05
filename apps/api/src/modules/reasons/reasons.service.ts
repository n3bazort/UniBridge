import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReasonScope } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateReasonDto } from './dto/create-reason.dto';
import { UpdateReasonDto } from './dto/update-reason.dto';

/**
 * Motivos tipificados de invalidación y de baja (RF-24).
 *
 * Antes eran texto libre, así que cada coordinador escribía el mismo motivo de
 * una forma distinta y ningún reporte podía agruparlos. Ahora se elige de una
 * lista, y el texto libre queda como nota que acompaña al motivo, no como el
 * motivo entero.
 *
 * El `code` es lo que agrupan los reportes y por eso no se puede cambiar una
 * vez creado: reescribirlo rompería el histórico sin avisar. La etiqueta que
 * se ve sí se puede corregir cuando haga falta.
 */
@Injectable()
export class ReasonsService {
  constructor(private prisma: PrismaService) {}

  /** Motivos base. Se siembran la primera vez que se piden. */
  private readonly BASE = [
    { code: 'EMPRESA_RECHAZA',    label: 'La empresa rechazó al estudiante',       scope: ReasonScope.PRACTICE, sortOrder: 10 },
    { code: 'ESTUDIANTE_RETIRA',  label: 'El estudiante se retiró',                scope: ReasonScope.PRACTICE, sortOrder: 20 },
    { code: 'CAMBIO_EMPRESA',     label: 'Cambio de empresa',                      scope: ReasonScope.PRACTICE, sortOrder: 30 },
    { code: 'CAMBIO_TUTOR',       label: 'Cambio de tutor',                        scope: ReasonScope.PRACTICE, sortOrder: 40 },
    { code: 'CUPO_AGOTADO',       label: 'La empresa no tenía cupo disponible',    scope: ReasonScope.PRACTICE, sortOrder: 50 },
    { code: 'DOC_DATOS_ERRONEOS', label: 'Error en los datos del documento',       scope: ReasonScope.DOCUMENT, sortOrder: 60 },
    { code: 'DOC_PERIODO_ERRADO', label: 'Período académico equivocado',           scope: ReasonScope.DOCUMENT, sortOrder: 70 },
    { code: 'DOC_REEMPLAZADO',    label: 'Reemplazado por una versión corregida',  scope: ReasonScope.DOCUMENT, sortOrder: 80 },
    { code: 'OTRO',               label: 'Otro motivo (se detalla en la nota)',    scope: ReasonScope.BOTH,     sortOrder: 99 },
  ];

  /**
   * Lista los motivos que sirven para un contexto. `scope` filtra el diálogo
   * que los pide: los de `BOTH` salen siempre porque valen en los dos.
   */
  async findAll(scope?: ReasonScope, incluirInactivos = false) {
    const total = await this.prisma.reasonCode.count();
    if (total === 0) {
      await this.prisma.reasonCode.createMany({
        data: this.BASE.map((r) => ({ ...r, isSystem: true })),
        skipDuplicates: true,
      });
    }

    return this.prisma.reasonCode.findMany({
      where: {
        ...(incluirInactivos ? {} : { isActive: true }),
        ...(scope ? { OR: [{ scope }, { scope: ReasonScope.BOTH }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  /**
   * Comprueba que el motivo exista y sirva para el contexto donde se usa.
   * Lo llaman los módulos que cierran prácticas o invalidan documentos, para
   * no aceptar un identificador cualquiera que llegue en la petición.
   */
  async validarPara(reasonId: string | null | undefined, scope: ReasonScope) {
    if (!reasonId) return null;

    const motivo = await this.prisma.reasonCode.findUnique({ where: { id: reasonId } });
    if (!motivo) throw new NotFoundException('El motivo indicado no existe');
    if (!motivo.isActive) throw new BadRequestException(`El motivo «${motivo.label}» está desactivado`);
    if (motivo.scope !== scope && motivo.scope !== ReasonScope.BOTH) {
      throw new BadRequestException(
        `El motivo «${motivo.label}» no corresponde a ` +
          (scope === ReasonScope.PRACTICE ? 'la baja de una práctica' : 'la invalidación de un documento'),
      );
    }
    return motivo;
  }

  async create(dto: CreateReasonDto) {
    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const repetido = await this.prisma.reasonCode.findUnique({ where: { code } });
    if (repetido) throw new ConflictException(`Ya existe un motivo con el código «${code}»`);

    const ultimo = await this.prisma.reasonCode.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.reasonCode.create({
      data: {
        code,
        label: dto.label.trim(),
        scope: dto.scope,
        sortOrder: dto.sortOrder ?? (ultimo?.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateReasonDto) {
    const motivo = await this.prisma.reasonCode.findUnique({ where: { id } });
    if (!motivo) throw new NotFoundException('El motivo no existe');

    // El código es la llave con la que los reportes agrupan el histórico:
    // cambiarlo partiría en dos las series que ya se hayan registrado.
    if (dto.code && dto.code.trim().toUpperCase() !== motivo.code) {
      throw new ForbiddenException(
        'El código de un motivo no se cambia porque es lo que agrupa los reportes. ' +
          'Corrige la etiqueta, o desactiva este motivo y crea uno nuevo.',
      );
    }

    return this.prisma.reasonCode.update({
      where: { id },
      data: {
        ...(dto.label ? { label: dto.label.trim() } : {}),
        ...(dto.scope ? { scope: dto.scope } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Los motivos no se borran: se desactivan. Un motivo eliminado dejaría sin
   * explicación a las prácticas y documentos que ya lo llevan registrado.
   */
  async deactivate(id: string) {
    const motivo = await this.prisma.reasonCode.findUnique({ where: { id } });
    if (!motivo) throw new NotFoundException('El motivo no existe');

    const [practicas, documentos] = await Promise.all([
      this.prisma.practice.count({ where: { closureReasonId: id } }),
      this.prisma.generatedDocument.count({ where: { invalidReasonId: id } }),
    ]);

    await this.prisma.reasonCode.update({ where: { id }, data: { isActive: false } });
    return {
      deactivated: true,
      practicesAffected: practicas,
      documentsAffected: documentos,
      message:
        practicas + documentos > 0
          ? `«${motivo.label}» deja de ofrecerse, pero los ${practicas + documentos} registros que ya lo llevan lo conservan.`
          : `«${motivo.label}» deja de ofrecerse en los diálogos.`,
    };
  }
}

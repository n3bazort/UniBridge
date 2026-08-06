import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreatePracticeLabelDto } from './dto/create-practice-label.dto';
import { UpdatePracticeLabelDto } from './dto/update-practice-label.dto';

/**
 * Etiquetas base que toda facultad tiene desde el principio. Se siembran la
 * primera vez que se piden, de modo que una facultad nueva no aparece vacía.
 *
 * «Finalizado» es la única con condición: recoge un hecho verificable, así que
 * solo puede ponerse cuando los documentos lo respaldan. Las demás son
 * anotaciones de seguimiento y se asignan libremente.
 */
const ETIQUETAS_BASE = [
  { name: 'Finalizado', color: '#16a34a', isSystem: true, requiresCompletion: true, sortOrder: 0 },
  { name: 'En gestión', color: '#f59e0b', isSystem: true, requiresCompletion: false, sortOrder: 1 },
  { name: 'Empresa sin aprobar', color: '#8b5cf6', isSystem: true, requiresCompletion: false, sortOrder: 2 },
  { name: 'No contestan', color: '#ef4444', isSystem: true, requiresCompletion: false, sortOrder: 3 },
];

@Injectable()
export class PracticeLabelsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Facultad sobre la que trabaja quien hace la petición.
   *
   * El token solo trae `facultyId` para los coordinadores; un administrador
   * llega sin ninguna porque los ve todo. Como las etiquetas sí pertenecen a
   * una facultad, en ese caso se resuelve la única existente, y si hubiera
   * varias se pide indicarla en vez de elegir una al azar.
   */
  private async resolverFacultad(facultyId?: string): Promise<string> {
    if (facultyId) return facultyId;

    const facultades = await this.prisma.faculty.findMany({
      where: { deletedAt: null },
      select: { id: true },
      take: 2,
    });
    if (facultades.length === 1) return facultades[0].id;
    if (facultades.length === 0) throw new BadRequestException('No hay ninguna facultad registrada');
    throw new BadRequestException(
      'Hay varias facultades: inicia sesión con una cuenta de coordinación para gestionar sus etiquetas',
    );
  }

  /**
   * Comprueba si una práctica reúne lo necesario para darse por finalizada:
   * los tres documentos vigentes y el certificado ya suscrito por las dos
   * autoridades. Devuelve lo que falta para poder explicarlo en pantalla.
   */
  private evaluarCierre(docs: Array<{ documentType: string | null; status: string | null; signatureStatus: string | null }>) {
    const vigente = (tipo: string) =>
      docs.some((d) => d.documentType === tipo && (d.status ?? 'VALID') === 'VALID');

    const falta: string[] = [];
    if (!vigente('SOLICITUD')) falta.push('la solicitud');
    if (!vigente('DESIGNACION')) falta.push('la designación');

    const certificado = docs.find(
      (d) => d.documentType === 'CERTIFICADO' && (d.status ?? 'VALID') === 'VALID',
    );
    if (!certificado) falta.push('el certificado');
    else if (certificado.signatureStatus !== 'SIGNED') falta.push('la firma de las dos autoridades');

    return { ok: falta.length === 0, falta };
  }

  /** Lista las etiquetas de la facultad, sembrando las base la primera vez. */
  async findAll(facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    const existentes = await this.prisma.practiceLabel.count({ where: { facultyId } });
    if (existentes === 0) {
      await this.prisma.practiceLabel.createMany({
        data: ETIQUETAS_BASE.map((e) => ({ ...e, facultyId })),
        skipDuplicates: true,
      });
    }

    return this.prisma.practiceLabel.findMany({
      where: { facultyId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreatePracticeLabelDto, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    const nombre = dto.name.trim();
    const repetida = await this.prisma.practiceLabel.findFirst({
      where: { facultyId, name: { equals: nombre, mode: 'insensitive' } },
    });
    if (repetida) throw new ConflictException(`Ya existe una etiqueta llamada «${nombre}»`);

    const ultima = await this.prisma.practiceLabel.findFirst({
      where: { facultyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.practiceLabel.create({
      data: {
        facultyId,
        name: nombre,
        color: dto.color,
        sortOrder: dto.sortOrder ?? (ultima?.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: string, dto: UpdatePracticeLabelDto, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const etiqueta = await this.prisma.practiceLabel.findFirst({ where: { id, facultyId } });
    if (!etiqueta) throw new NotFoundException('La etiqueta no existe en esta facultad');

    // Las etiquetas base admiten un color distinto, pero conservan su nombre:
    // la condición de «Finalizado» va atada a lo que ese nombre significa.
    if (etiqueta.isSystem && dto.name && dto.name.trim() !== etiqueta.name) {
      throw new ForbiddenException('Las etiquetas del sistema no se pueden renombrar; sí puedes cambiarles el color');
    }

    if (dto.name) {
      const nombre = dto.name.trim();
      const repetida = await this.prisma.practiceLabel.findFirst({
        where: { facultyId, name: { equals: nombre, mode: 'insensitive' }, id: { not: id } },
      });
      if (repetida) throw new ConflictException(`Ya existe una etiqueta llamada «${nombre}»`);
    }

    return this.prisma.practiceLabel.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.color ? { color: dto.color } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(id: string, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const etiqueta = await this.prisma.practiceLabel.findFirst({ where: { id, facultyId } });
    if (!etiqueta) throw new NotFoundException('La etiqueta no existe en esta facultad');
    if (etiqueta.isSystem) throw new ForbiddenException('Las etiquetas del sistema no se pueden eliminar');

    // Las prácticas que la tuvieran quedan sin etiqueta, no se borran.
    const enUso = await this.prisma.practice.count({ where: { labelId: id } });
    await this.prisma.practiceLabel.delete({ where: { id } });

    return { deleted: true, practicesAffected: enUso };
  }

  /**
   * Asigna la misma etiqueta a varias prácticas, o la retira si no se envía.
   * Devuelve además el estado anterior de cada una, que es lo que permite
   * ofrecer «Deshacer» en la interfaz.
   */
  async assign(practiceIds: string[], labelId: string | null | undefined, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    const practicas = await this.prisma.practice.findMany({
      where: { id: { in: practiceIds }, facultyId },
      select: {
        id: true,
        labelId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            generatedDocs: { select: { documentType: true, status: true, signatureStatus: true } },
          },
        },
      },
    });

    if (practicas.length === 0) throw new NotFoundException('No se encontraron prácticas de esta facultad');

    let etiqueta = null;
    if (labelId) {
      etiqueta = await this.prisma.practiceLabel.findFirst({ where: { id: labelId, facultyId } });
      if (!etiqueta) throw new NotFoundException('La etiqueta no existe en esta facultad');

      // La condición se verifica aquí, no solo en pantalla: es la garantía de
      // que «Finalizado» siempre significa lo mismo.
      if (etiqueta.requiresCompletion) {
        const sinCumplir = practicas
          .map((p) => ({ p, cierre: this.evaluarCierre(p.student.generatedDocs) }))
          .filter((x) => !x.cierre.ok);

        if (sinCumplir.length > 0) {
          const primero = sinCumplir[0];
          const nombre = `${primero.p.student.firstName} ${primero.p.student.lastName}`;
          const detalle =
            sinCumplir.length === 1
              ? `A ${nombre} le falta ${primero.cierre.falta.join(', ')}.`
              : `A ${sinCumplir.length} de las prácticas seleccionadas les faltan requisitos (por ejemplo, a ${nombre} le falta ${primero.cierre.falta.join(', ')}).`;
          throw new BadRequestException(
            `«${etiqueta.name}» solo puede asignarse con los tres documentos vigentes y el certificado firmado. ${detalle}`,
          );
        }
      }
    }

    const previo = practicas.map((p) => ({ practiceId: p.id, labelId: p.labelId }));

    await this.prisma.practice.updateMany({
      where: { id: { in: practicas.map((p) => p.id) } },
      data: { labelId: labelId ?? null },
    });

    return { updated: practicas.length, label: etiqueta, previous: previo };
  }

  /** Restaura la etiqueta que tenía cada práctica: sostiene el «Deshacer». */
  async restore(previous: Array<{ practiceId: string; labelId: string | null }>, facultyIdUsuario?: string) {
    if (!previous?.length) return { restored: 0 };
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    let restored = 0;
    for (const item of previous) {
      const { count } = await this.prisma.practice.updateMany({
        where: { id: item.practiceId, facultyId },
        data: { labelId: item.labelId },
      });
      restored += count;
    }
    return { restored };
  }
}

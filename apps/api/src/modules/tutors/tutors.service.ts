import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { assertPeriodoAbierto } from '../academic-periods/period.util';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { UpdateTutorDto } from './dto/update-tutor.dto';

/**
 * Docentes tutores (RF-22, RF-23).
 *
 * Este servicio es el ÚNICO sitio que escribe el tutor de una práctica. Dos
 * razones lo justifican:
 *
 *   1. El tope de veinte estudiantes por docente y período es una regla del
 *      servidor. Si cada módulo escribiera `tutorId` por su cuenta, la regla
 *      se comprobaría en unos caminos y en otros no —que es exactamente lo que
 *      pasó con la elegibilidad del certificado—.
 *
 *   2. `Practice.tutorName` sobrevive como copia del nombre para que las
 *      plantillas de documento sigan imprimiendo un texto. Manteniéndola desde
 *      un solo método no puede desincronizarse del `tutorId` que la respalda.
 */
@Injectable()
export class TutorsService {
  constructor(private prisma: PrismaService) {}

  /** Nombre normalizado: sin tildes, sin mayúsculas, sin espacios de más. */
  private clave(nombre: string) {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  /**
   * Facultad sobre la que trabaja quien pide.
   *
   * El token solo trae `facultyId` para los coordinadores; el administrador
   * llega sin ninguna porque las ve todas. Como el docente sí pertenece a una
   * facultad, se resuelve la única existente antes que elegir una al azar.
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
      'Hay varias facultades: inicia sesión con una cuenta de coordinación para gestionar sus docentes',
    );
  }

  /** El período en curso, que es contra el que se cuenta la carga. */
  private async periodoActivo(): Promise<string | null> {
    const p = await this.prisma.academicPeriod.findFirst({
      where: { isActive: true },
      select: { code: true },
    });
    return p?.code ?? null;
  }

  /**
   * Cuántos estudiantes lleva cada docente en un período.
   *
   * Solo cuentan las prácticas abiertas: una cerrada por reasignación o por
   * baja liberó su cupo, y seguir contándola dejaría al docente bloqueado por
   * estudiantes que ya no atiende.
   */
  private async cargaPorTutor(tutorIds: string[], academicPeriod: string) {
    if (tutorIds.length === 0) return new Map<string, number>();

    const filas = await this.prisma.practice.groupBy({
      by: ['tutorId'],
      where: {
        tutorId: { in: tutorIds },
        academicPeriod,
        deletedAt: null,
        closedAt: null,
        status: { notIn: ['CANCELED', 'REJECTED'] },
      },
      _count: { _all: true },
    });

    return new Map(filas.map((f) => [f.tutorId as string, f._count._all]));
  }

  /**
   * Lista los docentes con su carga actual, que es lo que la interfaz muestra
   * como «14 / 20» junto al nombre en el selector.
   */
  async findAll(
    facultyIdUsuario?: string,
    academicPeriod?: string,
    incluirInactivos = false,
    soloConPracticas = false,
  ) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const periodo = academicPeriod || (await this.periodoActivo());

    // Quién tiene estudiantes en ESTE período.
    //
    // Para asignar hace falta la lista entera —un docente sin nadie asignado
    // todavía sigue siendo asignable—, pero para registrar un acta no: la
    // aprobación de un docente que no lleva a nadie en el período no acredita
    // nada. Por eso el filtro se pide, no se impone.
    let conPracticas: Set<string> | null = null;
    if (soloConPracticas && periodo) {
      const filas = await this.prisma.practice.groupBy({
        by: ['tutorId'],
        where: { academicPeriod: periodo, deletedAt: null, tutorId: { not: null } },
      });
      conPracticas = new Set(filas.map((f) => f.tutorId as string));
    }

    const tutores = await this.prisma.tutor.findMany({
      where: {
        facultyId,
        deletedAt: null,
        ...(incluirInactivos ? {} : { isActive: true }),
        ...(conPracticas ? { id: { in: [...conPracticas] } } : {}),
      },
      include: { program: { select: { id: true, name: true, abbreviation: true } } },
      orderBy: { fullName: 'asc' },
    });

    // Sin período activo no hay contra qué contar: se devuelve la lista con la
    // carga en cero y se dice por qué, en vez de inventar un número.
    const carga = periodo
      ? await this.cargaPorTutor(tutores.map((t) => t.id), periodo)
      : new Map<string, number>();

    return tutores.map((t) => {
      const asignados = carga.get(t.id) ?? 0;
      return {
        ...t,
        academicPeriod: periodo,
        asignados,
        disponibles: Math.max(0, t.maxStudents - asignados),
        lleno: asignados >= t.maxStudents,
      };
    });
  }

  async findOne(id: string, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const tutor = await this.prisma.tutor.findFirst({
      where: { id, facultyId, deletedAt: null },
      include: { program: { select: { id: true, name: true } } },
    });
    if (!tutor) throw new NotFoundException('El docente no existe en esta facultad');
    return tutor;
  }

  async create(dto: CreateTutorDto, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const fullName = dto.fullName.replace(/\s+/g, ' ').trim();

    // La comparación ignora tildes y mayúsculas: «Ing. Pérez» e «ING. PEREZ»
    // eran dos docentes distintos cuando el nombre era texto libre, y ese
    // desdoble es justo lo que el RF-23 vino a cerrar.
    const existentes = await this.prisma.tutor.findMany({
      where: { facultyId, deletedAt: null },
      select: { id: true, fullName: true, isActive: true },
    });
    const gemelo = existentes.find((t) => this.clave(t.fullName) === this.clave(fullName));
    if (gemelo) {
      throw new ConflictException(
        `Ya está registrado «${gemelo.fullName}»` +
          (gemelo.isActive ? '' : ', aunque está desactivado: vuelve a activarlo en vez de crearlo otra vez'),
      );
    }

    return this.prisma.tutor.create({
      data: {
        facultyId,
        fullName,
        programId: dto.programId ?? null,
        dni: dto.dni?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        title: dto.title?.trim() || null,
        ...(dto.maxStudents !== undefined ? { maxStudents: dto.maxStudents } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateTutorDto, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const tutor = await this.prisma.tutor.findFirst({ where: { id, facultyId, deletedAt: null } });
    if (!tutor) throw new NotFoundException('El docente no existe en esta facultad');

    const fullName = dto.fullName ? dto.fullName.replace(/\s+/g, ' ').trim() : undefined;
    if (fullName && this.clave(fullName) !== this.clave(tutor.fullName)) {
      const existentes = await this.prisma.tutor.findMany({
        where: { facultyId, deletedAt: null, id: { not: id } },
        select: { fullName: true },
      });
      if (existentes.some((t) => this.clave(t.fullName) === this.clave(fullName))) {
        throw new ConflictException(`Ya está registrado un docente llamado «${fullName}»`);
      }
    }

    // Bajar el tope por debajo de lo que ya lleva no se rechaza: puede ser una
    // corrección legítima. Se aplica, y las asignaciones nuevas quedan
    // bloqueadas hasta que la carga vuelva a caber.
    const actualizado = await this.prisma.tutor.update({
      where: { id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(dto.programId !== undefined ? { programId: dto.programId || null } : {}),
        ...(dto.dni !== undefined ? { dni: dto.dni?.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.title !== undefined ? { title: dto.title?.trim() || null } : {}),
        ...(dto.maxStudents !== undefined ? { maxStudents: dto.maxStudents } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    // El nombre viaja a las prácticas que lo llevan: la copia se mantiene desde
    // aquí, así que renombrar al docente no deja documentos con la grafía vieja.
    if (fullName && fullName !== tutor.fullName) {
      await this.prisma.practice.updateMany({
        where: { tutorId: id },
        data: { tutorName: fullName },
      });
    }

    return actualizado;
  }

  /**
   * Retira a un docente. Si tiene prácticas a su nombre no se borra: se
   * desactiva, porque el historial de esas prácticas debe seguir nombrándolo.
   */
  async remove(id: string, facultyIdUsuario?: string) {
    const facultyId = await this.resolverFacultad(facultyIdUsuario);
    const tutor = await this.prisma.tutor.findFirst({ where: { id, facultyId, deletedAt: null } });
    if (!tutor) throw new NotFoundException('El docente no existe en esta facultad');

    const enUso = await this.prisma.practice.count({ where: { tutorId: id, deletedAt: null } });
    if (enUso > 0) {
      await this.prisma.tutor.update({ where: { id }, data: { isActive: false } });
      return {
        deleted: false,
        deactivated: true,
        practicesAffected: enUso,
        message:
          `«${tutor.fullName}» tiene ${enUso} práctica(s) a su nombre, así que se desactivó en vez de borrarlo: ` +
          'deja de aparecer en el selector y sus prácticas conservan el historial.',
      };
    }

    await this.prisma.tutor.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { deleted: true, deactivated: false, practicesAffected: 0 };
  }

  /**
   * Comprueba si al docente le caben `cuantos` estudiantes más en el período.
   *
   * Se expone aparte de `asignar` porque la importación desde Excel necesita
   * anticipar el rechazo fila por fila, antes de escribir nada (RF-26).
   */
  async verificarCupo(tutorId: string, academicPeriod: string, cuantos = 1, excluirPracticas: string[] = []) {
    const tutor = await this.prisma.tutor.findUnique({ where: { id: tutorId } });
    if (!tutor) throw new NotFoundException('El docente no existe');

    const asignados = await this.prisma.practice.count({
      where: {
        tutorId,
        academicPeriod,
        deletedAt: null,
        closedAt: null,
        status: { notIn: ['CANCELED', 'REJECTED'] },
        ...(excluirPracticas.length ? { id: { notIn: excluirPracticas } } : {}),
      },
    });

    const cabe = asignados + cuantos <= tutor.maxStudents;
    return {
      ok: cabe,
      tutorId,
      tutorName: tutor.fullName,
      asignados,
      max: tutor.maxStudents,
      disponibles: Math.max(0, tutor.maxStudents - asignados),
      solicitados: cuantos,
    };
  }

  /**
   * Dónde tiene sus estudiantes el docente. Se usa para explicar el rechazo:
   * «lleva 20, repartidos en tal y tal empresa» dice más que un número solo.
   */
  private async empresasDe(tutorId: string, academicPeriod: string) {
    const filas = await this.prisma.practice.findMany({
      where: { tutorId, academicPeriod, deletedAt: null, closedAt: null },
      select: { company: { select: { name: true } } },
    });
    const cuenta = new Map<string, number>();
    for (const f of filas) {
      const n = f.company?.name || 'Sin empresa';
      cuenta.set(n, (cuenta.get(n) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, n]) => `${nombre} (${n})`);
  }

  /**
   * Asigna un docente a una o varias prácticas. Único camino de escritura.
   *
   * Rechaza el lote entero si no cabe: asignar a la mitad dejaría al
   * coordinador con un grupo partido sin haberlo pedido.
   */
  async asignar(practiceIds: string[], tutorId: string | null, facultyIdUsuario?: string) {
    if (!practiceIds?.length) throw new BadRequestException('No se indicó ninguna práctica');
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    const practicas = await this.prisma.practice.findMany({
      where: { id: { in: practiceIds }, facultyId, deletedAt: null },
      select: { id: true, tutorId: true, tutorName: true, academicPeriod: true },
    });
    if (practicas.length === 0) throw new NotFoundException('No se encontraron prácticas de esta facultad');

    const previo = practicas.map((p) => ({ practiceId: p.id, tutorId: p.tutorId }));

    // Retirar el tutor tampoco se puede en un período cerrado, aunque no haya
    // tope que comprobar: sigue siendo una modificación.
    if (!tutorId) {
      for (const p of [...new Set(practicas.map((x) => x.academicPeriod))]) {
        await assertPeriodoAbierto(this.prisma, p, 'quitar el docente de una práctica');
      }
      await this.prisma.practice.updateMany({
        where: { id: { in: practicas.map((p) => p.id) } },
        data: { tutorId: null, tutorName: null },
      });
      return { updated: practicas.length, tutor: null, previous: previo };
    }

    // Un período cerrado es de solo lectura: se consulta, no se toca. Se
    // comprueba antes de mirar cupos para que el mensaje que llega sea el que
    // de verdad bloquea, y no un «no hay cupo» que despista.
    for (const p of [...new Set(practicas.map((x) => x.academicPeriod))]) {
      await assertPeriodoAbierto(this.prisma, p, 'cambiar el docente de una práctica');
    }

    const tutor = await this.prisma.tutor.findFirst({ where: { id: tutorId, facultyId, deletedAt: null } });
    if (!tutor) throw new NotFoundException('El docente no existe en esta facultad');
    if (!tutor.isActive) {
      throw new BadRequestException(`«${tutor.fullName}» está desactivado: actívalo antes de asignarle estudiantes`);
    }

    // El tope se cuenta por período, así que un lote que abarque dos períodos
    // se comprueba por separado en cada uno.
    const porPeriodo = new Map<string, string[]>();
    for (const p of practicas) {
      const lista = porPeriodo.get(p.academicPeriod) ?? [];
      lista.push(p.id);
      porPeriodo.set(p.academicPeriod, lista);
    }

    for (const [periodo, ids] of porPeriodo) {
      // Las que ya son suyas no suman: reasignarle una práctica que ya lleva
      // no le añade carga, y contarla lo bloquearía sin motivo.
      const nuevas = practicas.filter((p) => ids.includes(p.id) && p.tutorId !== tutorId);
      if (nuevas.length === 0) continue;

      const cupo = await this.verificarCupo(tutorId, periodo, nuevas.length, ids);
      if (!cupo.ok) {
        const empresas = await this.empresasDe(tutorId, periodo);
        throw new BadRequestException(
          `«${tutor.fullName}» ya lleva ${cupo.asignados} de ${cupo.max} estudiantes en el período ${periodo}` +
            (empresas.length ? `, repartidos en ${empresas.slice(0, 4).join(', ')}` : '') +
            `. Le ${cupo.disponibles === 1 ? 'queda 1 cupo' : `quedan ${cupo.disponibles} cupos`} y estás asignando ${nuevas.length}. ` +
            'Elige otro docente o quítale estudiantes antes.',
        );
      }
    }

    await this.prisma.practice.updateMany({
      where: { id: { in: practicas.map((p) => p.id) } },
      data: { tutorId: tutor.id, tutorName: tutor.fullName },
    });

    return { updated: practicas.length, tutor, previous: previo };
  }

  /** Devuelve cada práctica a su tutor anterior: sostiene el «Deshacer». */
  async restaurar(previous: Array<{ practiceId: string; tutorId: string | null }>, facultyIdUsuario?: string) {
    if (!previous?.length) return { restored: 0 };
    const facultyId = await this.resolverFacultad(facultyIdUsuario);

    const ids = [...new Set(previous.map((p) => p.tutorId).filter(Boolean))] as string[];
    const tutores = await this.prisma.tutor.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const nombreDe = new Map(tutores.map((t) => [t.id, t.fullName]));

    let restored = 0;
    for (const item of previous) {
      const { count } = await this.prisma.practice.updateMany({
        where: { id: item.practiceId, facultyId },
        data: {
          tutorId: item.tutorId,
          tutorName: item.tutorId ? nombreDe.get(item.tutorId) ?? null : null,
        },
      });
      restored += count;
    }
    return { restored };
  }
}

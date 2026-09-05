import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Normaliza cómo se escribe un periodo antes de compararlo.
 *
 * La Facultad llena los Excel a mano y el mismo semestre aparece como
 * «2025-1», «2025 - 1», «2025/1» o «2025-I». Son el mismo periodo, y
 * rechazarlos por la forma de escribirlos solo genera trabajo repetido.
 *
 * La corrección es deliberadamente conservadora: si el texto no tiene la
 * forma «año + semestre», se devuelve tal cual llegó. Un valor raro debe
 * fallar de forma visible, no convertirse en silencio en otro periodo.
 */
export function normalizePeriodCode(raw?: string | null): string {
  const texto = (raw ?? '').trim();
  if (!texto) return '';

  const coincidencia = texto.match(/(\d{4})\s*[-/ ]\s*(II|I|1|2)\b/i);
  if (!coincidencia) return texto;

  const [, anio, semestreCrudo] = coincidencia;
  const semestre = semestreCrudo.toUpperCase() === 'II' ? '2'
    : semestreCrudo.toUpperCase() === 'I' ? '1'
    : semestreCrudo;

  return `${anio}-${semestre}`;
}

/**
 * Periodo académico marcado como activo. Es el único donde se puede escribir.
 */
export async function getPeriodoActivo(prisma: PrismaService) {
  return prisma.academicPeriod.findFirst({ where: { isActive: true } });
}

/**
 * Corta cualquier escritura sobre un periodo que no sea el activo.
 *
 * REGLA DEL SISTEMA: el selector de periodo del topbar gobierna lo que se
 * *ve*; el periodo activo gobierna lo que se *escribe*. Cuando el admin da
 * un periodo por finalizado, ese semestre queda congelado: se puede
 * consultar y descargar lo que ya existe, pero no cargar prácticas nuevas
 * ni emitir documentos con fecha de un periodo cerrado.
 *
 * `accion` completa la frase «Solo se puede ___ en el periodo activo», así
 * que va en infinitivo: «cargar prácticas», «emitir documentos».
 */
export async function assertPeriodoAbierto(
  prisma: PrismaService,
  code: string,
  accion: string,
): Promise<void> {
  const codigo = normalizePeriodCode(code);
  const periodo = await prisma.academicPeriod.findUnique({ where: { code: codigo } });

  if (!periodo) {
    throw new BadRequestException(
      `El periodo "${codigo}" no existe en el sistema. ` +
      'Créalo en Configuración (panel de administración) antes de continuar.',
    );
  }

  if (!periodo.isActive) {
    const activo = await getPeriodoActivo(prisma);
    throw new BadRequestException(
      `El periodo ${codigo} está cerrado. Solo se puede ${accion} en el periodo activo` +
      `${activo ? ` (${activo.code})` : ''}. ` +
      `Si necesitas reabrir ${codigo}, actívalo en Configuración (panel de administración).`,
    );
  }
}

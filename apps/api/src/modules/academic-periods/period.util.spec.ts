import { BadRequestException } from '@nestjs/common';
import { normalizePeriodCode, assertPeriodoAbierto } from './period.util';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Doble de Prisma con solo lo que el guard consulta. Se le pasa el catálogo
 * de periodos que debe fingir tener.
 */
function prismaFalso(periodos: { code: string; isActive: boolean }[]) {
  return {
    academicPeriod: {
      findUnique: async ({ where }: any) =>
        periodos.find((p) => p.code === where.code) ?? null,
      findFirst: async () => periodos.find((p) => p.isActive) ?? null,
    },
  } as unknown as PrismaService;
}

describe('normalizePeriodCode', () => {
  it('acepta la forma canónica sin tocarla', () => {
    expect(normalizePeriodCode('2025-1')).toBe('2025-1');
    expect(normalizePeriodCode('2025-2')).toBe('2025-2');
  });

  it('reconoce las variantes que la Facultad escribe a mano', () => {
    expect(normalizePeriodCode(' 2025-1 ')).toBe('2025-1');
    expect(normalizePeriodCode('2025 - 1')).toBe('2025-1');
    expect(normalizePeriodCode('2025/1')).toBe('2025-1');
    expect(normalizePeriodCode('2025 1')).toBe('2025-1');
    expect(normalizePeriodCode('2025-I')).toBe('2025-1');
    expect(normalizePeriodCode('2025-II')).toBe('2025-2');
    expect(normalizePeriodCode('2025-ii')).toBe('2025-2');
  });

  it('devuelve intacto lo que no tiene forma de periodo, para que falle visible', () => {
    expect(normalizePeriodCode('primer semestre')).toBe('primer semestre');
    expect(normalizePeriodCode('2025')).toBe('2025');
  });

  it('no confunde un año con otro semestre', () => {
    // Sin frontera de palabra, «2025-11» se leería como «2025-1».
    expect(normalizePeriodCode('2025-11')).toBe('2025-11');
  });

  it('trata el vacío como ausencia, no como error', () => {
    expect(normalizePeriodCode('')).toBe('');
    expect(normalizePeriodCode(null)).toBe('');
    expect(normalizePeriodCode(undefined)).toBe('');
  });
});

describe('assertPeriodoAbierto', () => {
  const catalogo = [
    { code: '2024-1', isActive: false },
    { code: '2025-1', isActive: false },
    { code: '2025-2', isActive: true },
  ];

  it('deja pasar la escritura en el periodo activo', async () => {
    await expect(
      assertPeriodoAbierto(prismaFalso(catalogo), '2025-2', 'cargar prácticas'),
    ).resolves.toBeUndefined();
  });

  it('acepta el periodo activo aunque venga mal escrito', async () => {
    await expect(
      assertPeriodoAbierto(prismaFalso(catalogo), '2025 - II', 'cargar prácticas'),
    ).resolves.toBeUndefined();
  });

  it('frena la escritura en un periodo cerrado y dice cuál está abierto', async () => {
    await expect(
      assertPeriodoAbierto(prismaFalso(catalogo), '2025-1', 'emitir documentos'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      assertPeriodoAbierto(prismaFalso(catalogo), '2025-1', 'emitir documentos'),
    ).rejects.toThrow(/2025-1 está cerrado.*emitir documentos.*2025-2/s);
  });

  it('frena un periodo que no existe en vez de crearlo al vuelo', async () => {
    await expect(
      assertPeriodoAbierto(prismaFalso(catalogo), '2023-2', 'cargar prácticas'),
    ).rejects.toThrow(/"2023-2" no existe/);
  });

  it('no revienta cuando no hay ningún periodo activo', async () => {
    const sinActivo = [{ code: '2025-1', isActive: false }];
    await expect(
      assertPeriodoAbierto(prismaFalso(sinActivo), '2025-1', 'cargar prácticas'),
    ).rejects.toThrow(/2025-1 está cerrado/);
  });
});

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Dar de baja a un estudiante de su práctica (RF-21).
 *
 * Cuando el retiro ocurre semanas después, el oficio ya está firmado y
 * entregado en físico. El sistema registra la baja con su motivo pero NO
 * reemite el documento: la validez de la firma es física y un papel nuevo no
 * cambiaría el que ya está en la empresa.
 */
export class ClosePracticeDto {
  @ApiProperty({ description: 'Motivo tipificado del catálogo (GET /reasons?scope=PRACTICE)' })
  @IsUUID('4', { message: 'Elige un motivo de la lista' })
  reasonId: string;

  @ApiPropertyOptional({ description: 'Nota que matiza el motivo' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La nota no puede pasar de 500 caracteres' })
  note?: string;
}

/**
 * Mover a un estudiante a otra empresa o a otro docente (RF-19).
 *
 * La práctica anterior queda cerrada con su motivo y la nueva arranca
 * apuntando a ella, de modo que el recorrido completo siga siendo legible.
 */
export class ReassignPracticeDto {
  @ApiProperty({ description: 'Motivo tipificado del cierre de la práctica anterior' })
  @IsUUID('4', { message: 'Elige un motivo de la lista' })
  reasonId: string;

  @ApiPropertyOptional({ description: 'Empresa de destino. Sin ella, se conserva la actual.' })
  @IsOptional()
  @IsUUID('4', { message: 'La empresa indicada no es válida' })
  companyId?: string;

  @ApiPropertyOptional({ description: 'Docente de destino. Se comprueba su tope de 20 (RF-22).' })
  @IsOptional()
  @IsUUID('4', { message: 'El docente indicado no es válido' })
  tutorId?: string;

  @ApiPropertyOptional({ description: 'Área de la empresa donde desempeñará las actividades' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workArea?: string;

  @ApiPropertyOptional({ description: 'Nota que matiza el motivo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

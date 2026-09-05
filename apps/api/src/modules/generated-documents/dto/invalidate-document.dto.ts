import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Anular un documento oficial exige decir por qué.
 *
 * La pantalla ya obliga a indicarlo antes de habilitar el botón, pero la
 * pantalla no es la garantía: quien llegue por la API sin pasar por ella
 * también tiene que dejarlo. Un documento anulado sin motivo es un documento
 * que no se puede defender ante una auditoría — que es justo lo único que la
 * anulación pretende resolver.
 *
 * Desde el RF-24 el motivo se elige de un catálogo, porque el texto libre
 * hacía que cada quien escribiera lo mismo de otra forma y ningún reporte
 * pudiera agruparlo. Cuando viene `reasonId`, `reason` pasa a ser la nota que
 * lo acompaña y deja de ser obligatoria; sin `reasonId` se sigue exigiendo el
 * texto, para que las integraciones anteriores no se rompan.
 */
export class InvalidateDocumentDto {
  @ApiPropertyOptional({ description: 'Motivo tipificado del catálogo (GET /reasons?scope=DOCUMENT)' })
  @IsOptional()
  @IsUUID('4', { message: 'El motivo indicado no es válido' })
  reasonId?: string;

  @ApiProperty({
    example: 'La empresa cambió de razón social antes de recibir el oficio',
    description: 'Nota que acompaña al motivo. Obligatoria solo si no se envía `reasonId`.',
    required: false,
  })
  @ValidateIf((o) => !o.reasonId)
  @IsString()
  @IsNotEmpty({ message: 'Hay que indicar por qué se anula el documento' })
  @MinLength(10, { message: 'El motivo debe explicar la razón: al menos 10 caracteres' })
  @MaxLength(500)
  reason!: string;
}

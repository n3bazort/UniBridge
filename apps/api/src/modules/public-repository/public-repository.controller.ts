import {
  BadRequestException, Body, Controller, Get, Param, Post, Query, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicRepositoryService } from './public-repository.service';

/**
 * Consulta pública por cédula (RF-27). SIN sesión, a propósito: el estudiante
 * no tiene cuenta en el sistema.
 *
 * El límite de intentos es lo único que separa esto de un padrón consultable
 * a fuerza bruta, así que va apretado: veinte consultas por minuto y por IP.
 * Probar los diez millones de cédulas posibles a ese ritmo llevaría siglos.
 */
@ApiTags('repositorio-publico')
@Controller('public/repository')
export class PublicRepositoryController {
  constructor(private readonly service: PublicRepositoryService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('lookup')
  @ApiOperation({ summary: 'Documentos vigentes de un estudiante, por cédula exacta. Sin sesión.' })
  lookup(@Query('dni') dni: string) {
    if (!dni) throw new BadRequestException('Indica la cédula del estudiante');
    return this.service.consultarPorCedula(dni);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get(':id/download')
  @ApiOperation({ summary: 'Enlace de descarga; exige de nuevo la cédula del dueño' })
  download(@Param('id') id: string, @Query('dni') dni: string) {
    if (!dni) throw new BadRequestException('Indica la cédula del estudiante');
    return this.service.descargar(id, dni);
  }
}

/**
 * Carga de la designación firmada que devuelve la empresa.
 *
 * Va en su propio controlador porque esto SÍ exige sesión: lo hace la
 * coordinación al recibir el papel sellado, no el estudiante.
 */
@ApiTags('repositorio-publico')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returned-documents')
export class ReturnedDocumentsController {
  constructor(private readonly service: PublicRepositoryService) {}

  @Post(':id/upload')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  @ApiOperation({ summary: 'Archiva la copia firmada y sellada que devolvió la empresa' })
  upload(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Adjunta el PDF firmado que devolvió la empresa');
    return this.service.guardarDevuelta(id, file, req.user?.id);
  }
}

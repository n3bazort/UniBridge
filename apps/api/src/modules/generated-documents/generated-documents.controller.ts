import { Controller, Post, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { GenerateSolicitudDto } from './dto/generate-solicitud.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('generated-documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('generated-documents')
export class GeneratedDocumentsController {
  constructor(private readonly service: GeneratedDocumentsService) {}

  @Post('generate')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera un documento fusionando un Template con los datos de un Estudiante' })
  generate(@Req() req: any, @Body() dto: GenerateDocumentDto) {
    return this.service.generate(dto.templateId, dto.studentId, req.user?.id);
  }

  @Post('generate-batch')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera múltiples documentos en segundo plano para no saturar memoria' })
  generateBatch(@Req() req: any, @Body() dto: GenerateBatchDto) {
    return this.service.generateBatch(dto.templateId, dto.studentIds, req.user?.id);
  }

  @Post('generate-solicitud')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera una solicitud grupal agrupando a los estudiantes (DOCX)' })
  generateSolicitud(@Req() req: any, @Body() dto: GenerateSolicitudDto) {
    return this.service.generateSolicitudGrouped(dto.templateId, dto.studentIds, req.user?.id, dto.overwrite);
  }

  @Post('check-solicitud')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Verifica si ya existe una solicitud válida para los estudiantes' })
  checkSolicitud(@Body('studentIds') studentIds: string[]) {
    return this.service.checkExistingSolicitud(studentIds);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Lista todos los documentos generados' })
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Obtiene los documentos del estudiante logueado' })
  findMyDocuments(@Req() req: any) {
    return this.service.findMyDocuments(req.user.id);
  }

  @SkipThrottle()
  @Get('batch/:batchId/progress')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Progreso de un lote de generación masiva (BullMQ)' })
  getBatchProgress(@Param('batchId') batchId: string) {
    return this.service.getBatchProgress(batchId);
  }

  @Get(':id/download')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.STUDENT, Role.SIGNER)
  @ApiOperation({ summary: 'Devuelve una URL prefirmada de descarga (bucket privado, expira en 15 min)' })
  getDownloadUrl(@Req() req: any, @Param('id') id: string) {
    return this.service.getDownloadUrl(id, { id: req.user.id, role: req.user.role });
  }

  @Get(':id/view')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.STUDENT, Role.SIGNER)
  @ApiOperation({ summary: 'Devuelve una URL prefirmada para visualización en línea (bucket privado)' })
  getViewUrl(@Req() req: any, @Param('id') id: string) {
    return this.service.getViewUrl(id, { id: req.user.id, role: req.user.role });
  }

  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Lista documentos de un estudiante específico' })
  findByStudent(@Param('studentId') studentId: string) {
    return this.service.findByStudent(studentId);
  }

  @Patch(':id/invalidate')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Invalida un documento generado' })
  invalidate(@Param('id') id: string, @Body('reason') reason: string) {
    return this.service.invalidate(id, reason);
  }

  @Post(':id/regenerate')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera una nueva versión de un documento invalidado' })
  regenerate(@Req() req: any, @Param('id') id: string) {
    return this.service.regenerate(id, req.user?.id);
  }
}

import {
  Controller, Post, Get, Patch, Param, Body, Query, UseGuards, Req, Res,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { GenerateSolicitudDto } from './dto/generate-solicitud.dto';
import { GenerateOficioDto } from './dto/generate-oficio.dto';
import { InvalidateDocumentDto } from './dto/invalidate-document.dto';
import { OficioKind } from './oficio.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
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
    return this.service.generateSolicitudGrouped(dto.templateId, dto.studentIds, req.user?.id, dto.overwrite, dto.asPdf);
  }

  @Post('generate-oficio')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera un oficio en Word (solicitud o designación) agrupado por empresa' })
  generateOficio(@Req() req: any, @Body() dto: GenerateOficioDto) {
    return this.service.generateOficioGrouped(dto.kind, dto.templateId, dto.studentIds, req.user?.id, dto.overwrite, dto.asPdf);
  }

  @Post('check-solicitud')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Verifica si ya existe una solicitud válida para los estudiantes' })
  checkSolicitud(@Body('studentIds') studentIds: string[]) {
    return this.service.checkExistingSolicitud(studentIds);
  }

  @Post('check-oficio')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Verifica si ya existe un oficio vigente de ese tipo para los estudiantes' })
  checkOficio(@Body('kind') kind: OficioKind, @Body('studentIds') studentIds: string[]) {
    return this.service.checkExistingOficio(kind, studentIds);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Lista todos los documentos generados. Sin academicPeriod, trae todos (compatibilidad).' })
  findAll(@Query('academicPeriod') academicPeriod?: string) {
    return this.service.findAll(academicPeriod);
  }

  @SkipThrottle()
  @Get('batch/:batchId/progress')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Progreso de un lote de generación masiva (BullMQ)' })
  getBatchProgress(@Param('batchId') batchId: string) {
    return this.service.getBatchProgress(batchId);
  }

  @Get(':id/download')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiOperation({ summary: 'Devuelve una URL prefirmada de descarga (bucket privado, expira en 15 min)' })
  getDownloadUrl(@Req() req: any, @Param('id') id: string) {
    return this.service.getDownloadUrl(id, { id: req.user.id, role: req.user.role });
  }

  @Post('check-certificate-eligibility')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Quiénes pueden certificarse y qué le falta a cada uno de los demás' })
  checkCertificateEligibility(@Body('studentIds') studentIds: string[]) {
    return this.service.checkCertificateEligibility(studentIds);
  }

  @Post('export-certificados-zip')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'ZIP con los certificados seleccionados, con nombres legibles para el estudiante' })
  exportCertificadosZip(
    @Body() body: { documentIds: string[]; academicPeriod?: string },
    @Res() res: Response,
  ) {
    return this.service.streamCertificadosZip(res, body?.documentIds, body?.academicPeriod);
  }

  @Post('purge-trash')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ejecuta ahora la purga de la papelera (versiones anuladas con +30 días)' })
  purgeTrash() {
    return this.service.purgeTrash();
  }

  @Get(':id/view')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
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

  @Get(':id/invalidation-impact')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Qué documentos se anularían en cascada al invalidar este' })
  invalidationImpact(@Param('id') id: string) {
    return this.service.invalidationImpact(id);
  }

  @Patch(':id/invalidate')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Invalida un documento generado y los que dependían de él' })
  invalidate(@Param('id') id: string, @Body() dto: InvalidateDocumentDto, @Req() req: any) {
    return this.service.invalidate(id, dto.reason, req.user?.id, dto.reasonId);
  }

  // ─────────── Edición manual del oficio (coordinación) ───────────

  @Post(':id/replace-file')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  @ApiOperation({ summary: 'Sube el Word corregido: reemplaza al vigente conservando código y sumando versión' })
  replaceFile(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    if (!file) throw new BadRequestException('Debes adjuntar el documento de Word corregido');
    return this.service.replaceFile(id, file, req.user?.id);
  }

  @Post(':id/convert-to-pdf')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Convierte a PDF el oficio en Word ya revisado, conservando su código' })
  convertToPdf(@Req() req: any, @Param('id') id: string) {
    return this.service.convertToPdf(id, req.user?.id);
  }

  @Post('print')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Une los documentos seleccionados en un solo PDF listo para imprimir' })
  async print(@Body('ids') ids: string[], @Res() res: Response) {
    const { buffer, included, skipped } = await this.service.buildPrintablePdf(ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Impresion_${included}_documentos.pdf"`);
    res.setHeader('X-Documentos-Incluidos', String(included));
    if (skipped.length) res.setHeader('X-Documentos-Omitidos', skipped.join(','));
    res.send(buffer);
  }

  @Post(':id/regenerate')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Genera una nueva versión de un documento invalidado' })
  regenerate(@Req() req: any, @Param('id') id: string) {
    return this.service.regenerate(id, req.user?.id);
  }
}

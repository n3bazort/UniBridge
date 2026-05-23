import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { GenerateSolicitudDto } from './dto/generate-solicitud.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
    return this.service.generateSolicitudGrouped(dto.templateId, dto.studentIds, req.user?.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Lista todos los documentos generados' })
  findAll() {
    return this.service.findAll();
  }

  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.STUDENT)
  @ApiOperation({ summary: 'Lista documentos de un estudiante específico' })
  findByStudent(@Param('studentId') studentId: string) {
    return this.service.findByStudent(studentId);
  }
}

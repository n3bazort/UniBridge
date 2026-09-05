import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Req, BadRequestException } from '@nestjs/common';
import { PracticesService } from './practices.service';
import { CreatePracticeDto } from './dto/create-practice.dto';
import { UpdatePracticeDto } from './dto/update-practice.dto';
import { ClosePracticeDto, ReassignPracticeDto } from './dto/close-practice.dto';
import { BulkImportPracticesDto } from './dto/bulk-import-practices.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('practices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('practices')
export class PracticesController {
  constructor(private readonly practicesService: PracticesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Registrar nueva práctica' })
  create(@Body() createPracticeDto: CreatePracticeDto) {
    return this.practicesService.create(createPracticeDto);
  }

  @Post('bulk-import')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Importar múltiples prácticas desde Excel' })
  bulkImport(@Body() body: BulkImportPracticesDto, @Req() req: any) {
    const facultyId = req.user?.facultyId;
    return this.practicesService.bulkImport(body.programName, body.students, facultyId);
  }


  @Post('bulk-import/preview')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Revisa el archivo fila por fila sin escribir nada (RF-26)' })
  previewBulkImport(@Body() body: { students?: any[] }, @Req() req: any) {
    // A propósito SIN el DTO estricto: el trabajo de esta ruta es justamente
    // recibir un archivo imperfecto y decir qué tiene mal, fila por fila. Si la
    // validación lo rechazara en la puerta, el coordinador volvería a recibir
    // «students.2.firstName should not be empty» y tendría que adivinar cuál es
    // la fila 2 — que es exactamente lo que el RF-26 vino a resolver.
    if (!Array.isArray(body?.students)) {
      throw new BadRequestException('No se recibió ninguna fila que revisar')
    }
    return this.practicesService.previewBulkImport(body.students, req.user?.facultyId)
  }

  @Get('dashboard-stats')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiOperation({ summary: 'Obtener estadísticas del dashboard. Sin academicPeriod, agrega todos los periodos.' })
  getDashboardStats(@Req() req: any, @Query('academicPeriod') academicPeriod?: string) {
    const facultyId = req.user?.facultyId;
    return this.practicesService.getDashboardStats(facultyId, academicPeriod);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiOperation({ summary: 'Listar prácticas (Multi-tenant activo)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.practicesService.findAll(paginationDto);
  }

  // IMPORTANTE: esta ruta debe ir ANTES de @Get(':id') para que NestJS
  // no interprete 'tutors' como un parámetro :id
  @Get('tutors')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Buscar nombres de tutores académicos ya registrados en prácticas (max 3)' })
  async searchTutors(@Query('search') search: string) {
    if (!search || search.trim().length < 2) return []
    return this.practicesService.searchTutorNames(search.trim())
  }

  // Sugerencias de valores más usados para campos de texto libre (workArea, academicPeriod, etc.)
  @Get('field-suggestions')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Valores más frecuentes de un campo de práctica para mostrar como sugerencias' })
  async getFieldSuggestions(
    @Query('field') field: 'workArea' | 'academicPeriod' | 'academicLevel' | 'practiceLevel',
    @Query('search') search?: string,
  ) {
    return this.practicesService.getTopFieldValues(field, search, 5)
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Obtener detalle de práctica' })
  findOne(@Param('id') id: string) {
    return this.practicesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Actualizar estado de práctica' })
  update(@Param('id') id: string, @Body() updatePracticeDto: UpdatePracticeDto, @Req() req: any) {
    return this.practicesService.update(id, updatePracticeDto, req.user?.id);
  }

  @Post('restore-documents')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Deshacer invalidación de solicitudes tras una reasignación de empresa' })
  restoreDocuments(@Body() body: { documentIds: string[] }) {
    return this.practicesService.restoreDocuments(body.documentIds || []);
  }

  @Post('recalculate-status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Recalcular el estado de todas las prácticas según sus documentos y firmas' })
  recalculateStatuses() {
    return this.practicesService.recalculateAllStatuses();
  }



  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Dar de baja al estudiante con su motivo, sin reemitir el documento (RF-21)' })
  close(@Param('id') id: string, @Body() dto: ClosePracticeDto, @Req() req: any) {
    return this.practicesService.close(id, dto, req.user?.id)
  }

  @Post(':id/reassign')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Mover al estudiante a otra empresa o docente, conservando el historial (RF-19)' })
  reassign(@Param('id') id: string, @Body() dto: ReassignPracticeDto, @Req() req: any) {
    return this.practicesService.reassign(id, dto, req.user?.id)
  }

  @Get('history/:studentId')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Recorrido completo del estudiante: sus prácticas encadenadas' })
  history(@Param('studentId') studentId: string) {
    return this.practicesService.history(studentId)
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar práctica' })
  remove(@Param('id') id: string) {
    return this.practicesService.remove(id)
  }
}

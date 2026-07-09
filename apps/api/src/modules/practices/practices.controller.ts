import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Req } from '@nestjs/common';
import { PracticesService } from './practices.service';
import { CreatePracticeDto } from './dto/create-practice.dto';
import { UpdatePracticeDto } from './dto/update-practice.dto';
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


  @Get('dashboard-stats')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Obtener estadísticas del dashboard' })
  getDashboardStats(@Req() req: any) {
    const facultyId = req.user?.facultyId;
    return this.practicesService.getDashboardStats(facultyId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Listar prácticas (Multi-tenant activo)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.practicesService.findAll(paginationDto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.STUDENT)
  @ApiOperation({ summary: 'Obtener detalle de práctica' })
  findOne(@Param('id') id: string) {
    return this.practicesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Actualizar estado de práctica' })
  update(@Param('id') id: string, @Body() updatePracticeDto: UpdatePracticeDto) {
    return this.practicesService.update(id, updatePracticeDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar práctica' })
  remove(@Param('id') id: string) {
    return this.practicesService.remove(id);
  }
}

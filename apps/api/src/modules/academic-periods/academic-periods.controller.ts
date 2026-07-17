import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AcademicPeriodsService } from './academic-periods.service';
import { CreateAcademicPeriodDto } from './dto/create-academic-period.dto';
import { UpdateAcademicPeriodDto } from './dto/update-academic-period.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('academic-periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic-periods')
export class AcademicPeriodsController {
  constructor(private readonly academicPeriodsService: AcademicPeriodsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los períodos académicos' })
  findAll() {
    return this.academicPeriodsService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Obtener el período académico activo' })
  findActive() {
    return this.academicPeriodsService.findActive();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear nuevo período académico' })
  create(@Body() createDto: CreateAcademicPeriodDto) {
    return this.academicPeriodsService.create({
      ...createDto,
      startDate: new Date(createDto.startDate),
      endDate: new Date(createDto.endDate),
    });
  }

  @Put(':id')
  // Configuración institucional (autoridades, periodo activo): solo el ADMIN.
  // El coordinador consume esta configuración, no la define.
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar período académico' })
  update(@Param('id') id: string, @Body() updateDto: UpdateAcademicPeriodDto) {
    const data: Record<string, unknown> = { ...updateDto };
    if (updateDto.startDate) data.startDate = new Date(updateDto.startDate);
    if (updateDto.endDate) data.endDate = new Date(updateDto.endDate);
    return this.academicPeriodsService.update(id, data);
  }
}


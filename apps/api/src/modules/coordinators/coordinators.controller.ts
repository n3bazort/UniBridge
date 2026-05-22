import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CoordinatorsService } from './coordinators.service';
import { CreateCoordinatorDto } from './dto/create-coordinator.dto';
import { UpdateCoordinatorDto } from './dto/update-coordinator.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('coordinators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('coordinators')
export class CoordinatorsController {
  constructor(private readonly coordinatorsService: CoordinatorsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Asignar coordinador a facultad (Solo ADMIN)' })
  create(@Body() createCoordinatorDto: CreateCoordinatorDto) {
    return this.coordinatorsService.create(createCoordinatorDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos los coordinadores' })
  findAll() {
    return this.coordinatorsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Obtener un coordinador' })
  findOne(@Param('id') id: string) {
    return this.coordinatorsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar asignación de coordinador' })
  update(@Param('id') id: string, @Body() updateCoordinatorDto: UpdateCoordinatorDto) {
    return this.coordinatorsService.update(id, updateCoordinatorDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar coordinador' })
  remove(@Param('id') id: string) {
    return this.coordinatorsService.remove(id);
  }
}

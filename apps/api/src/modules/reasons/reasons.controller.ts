import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReasonScope, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReasonsService } from './reasons.service';
import { CreateReasonDto } from './dto/create-reason.dto';
import { UpdateReasonDto } from './dto/update-reason.dto';

@ApiTags('reasons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reasons')
export class ReasonsController {
  constructor(private readonly service: ReasonsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Motivos tipificados; scope=PRACTICE para bajas, DOCUMENT para invalidaciones' })
  findAll(@Query('scope') scope?: ReasonScope, @Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(scope, includeInactive === 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Añadir un motivo propio al catálogo' })
  create(@Body() dto: CreateReasonDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Corregir la etiqueta, el ámbito o el orden de un motivo' })
  update(@Param('id') id: string, @Body() dto: UpdateReasonDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desactivar un motivo: deja de ofrecerse y los registros que lo llevan lo conservan' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PracticeLabelsService } from './practice-labels.service';
import { CreatePracticeLabelDto } from './dto/create-practice-label.dto';
import { UpdatePracticeLabelDto } from './dto/update-practice-label.dto';
import { AssignPracticeLabelDto } from './dto/assign-practice-label.dto';

@ApiTags('practice-labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('practice-labels')
export class PracticeLabelsController {
  constructor(private readonly service: PracticeLabelsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Listar las etiquetas de seguimiento de la facultad' })
  findAll(@Req() req: any) {
    return this.service.findAll(req.user?.facultyId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Crear una etiqueta propia' })
  create(@Body() dto: CreatePracticeLabelDto, @Req() req: any) {
    return this.service.create(dto, req.user?.facultyId);
  }

  @Patch('assign')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Asignar (o retirar) una etiqueta en una o varias prácticas' })
  assign(@Body() dto: AssignPracticeLabelDto, @Req() req: any) {
    return this.service.assign(dto.practiceIds, dto.labelId, req.user?.facultyId);
  }

  @Patch('restore')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Devolver las etiquetas a su valor anterior (deshacer)' })
  restore(
    @Body() body: { previous: Array<{ practiceId: string; labelId: string | null }> },
    @Req() req: any,
  ) {
    return this.service.restore(body?.previous, req.user?.facultyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Renombrar una etiqueta o cambiarle el color' })
  update(@Param('id') id: string, @Body() dto: UpdatePracticeLabelDto, @Req() req: any) {
    return this.service.update(id, dto, req.user?.facultyId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Eliminar una etiqueta propia' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user?.facultyId);
  }
}

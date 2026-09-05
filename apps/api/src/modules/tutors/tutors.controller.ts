import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TutorsService } from './tutors.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { UpdateTutorDto } from './dto/update-tutor.dto';
import { AssignTutorDto } from './dto/assign-tutor.dto';

@ApiTags('tutors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tutors')
export class TutorsController {
  constructor(private readonly service: TutorsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Docentes tutores con su carga del período: «14 / 20»' })
  findAll(
    @Req() req: any,
    @Query('academicPeriod') academicPeriod?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('withPractices') withPractices?: string,
  ) {
    // `withPractices=true` deja solo a los que llevan estudiantes en ese
    // período. Lo usa la pantalla de actas; el selector de reasignación no,
    // porque ahí sí hace falta poder elegir a un docente que aún no lleva a nadie.
    return this.service.findAll(
      req.user?.facultyId,
      academicPeriod,
      includeInactive === 'true',
      withPractices === 'true',
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Registrar un docente tutor' })
  create(@Body() dto: CreateTutorDto, @Req() req: any) {
    return this.service.create(dto, req.user?.facultyId);
  }

  @Patch('assign')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Asignar (o retirar) el docente de una o varias prácticas, con el tope de 20' })
  assign(@Body() dto: AssignTutorDto, @Req() req: any) {
    return this.service.asignar(dto.practiceIds, dto.tutorId ?? null, req.user?.facultyId);
  }

  @Patch('restore')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Devolver cada práctica a su docente anterior (deshacer)' })
  restore(
    @Body() body: { previous: Array<{ practiceId: string; tutorId: string | null }> },
    @Req() req: any,
  ) {
    return this.service.restaurar(body?.previous, req.user?.facultyId);
  }

  @Get(':id/capacity')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Cuántos cupos le quedan al docente en el período' })
  capacity(
    @Param('id') id: string,
    @Query('academicPeriod') academicPeriod: string,
    @Query('count') count?: string,
  ) {
    return this.service.verificarCupo(id, academicPeriod, Number(count) || 1);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Ficha de un docente' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user?.facultyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Editar los datos del docente o su tope de estudiantes' })
  update(@Param('id') id: string, @Body() dto: UpdateTutorDto, @Req() req: any) {
    return this.service.update(id, dto, req.user?.facultyId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Retirar al docente; si tiene prácticas, se desactiva en vez de borrarse' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user?.facultyId);
  }
}

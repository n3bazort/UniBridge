import {
  Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompletionRecordsService } from './completion-records.service';
import { ConfirmCompletionDto } from './dto/confirm-completion.dto';

/** El acta viene de Secretaría General: no pesa, y un tope bajo evita abusos. */
const LIMITE = { fileSize: 15 * 1024 * 1024 };

@ApiTags('completion-records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('completion-records')
export class CompletionRecordsController {
  constructor(private readonly service: CompletionRecordsService) {}

  @Post('preview')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: LIMITE }))
  @ApiOperation({ summary: 'Lee el acta en PDF y devuelve la revisión por grupos, sin escribir nada' })
  preview(
    @Req() req: any,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() body: { academicPeriod?: string },
  ) {
    return this.service.previsualizar(
      file,
      { academicPeriod: body?.academicPeriod },
      req.user?.facultyId,
    );
  }

  @Post('confirm')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: LIMITE }))
  @ApiOperation({ summary: 'Registra el acta en PDF y marca la aprobación del docente que la firma' })
  confirm(
    @Req() req: any,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() dto: ConfirmCompletionDto,
  ) {
    // Al ir en multipart, la lista de prácticas llega como texto y hay que
    // devolverla a su forma antes de que el servicio la use.
    const practiceIds = typeof (dto as any).practiceIds === 'string'
      ? JSON.parse((dto as any).practiceIds || '[]')
      : dto.practiceIds;

    return this.service.confirmar(
      file,
      { ...dto, practiceIds },
      req.user?.id,
      req.user?.facultyId,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Actas registradas: quién aprobó a quién y cuándo' })
  findAll(@Req() req: any, @Query('academicPeriod') academicPeriod?: string) {
    return this.service.findAll(req.user?.facultyId, academicPeriod);
  }

  @Get(':id/download')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'URL de descarga del acta archivada, mientras siga dentro de sus 30 días' })
  download(@Param('id') id: string, @Req() req: any) {
    return this.service.getDownloadUrl(id, req.user?.facultyId);
  }

  @Post('purge')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retira ahora las actas que ya cumplieron sus 30 días' })
  purge() {
    return this.service.purgar();
  }
}

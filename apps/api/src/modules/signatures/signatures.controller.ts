import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SignaturesService } from './signatures.service';
import { SignersService } from './signers.service';
import { CreateSignatureBatchDto } from './dto/create-signature-batch.dto';
import { CreateSignerDto } from './dto/create-signer.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { RegisterSignerDto } from './dto/register-signer.dto';

@ApiTags('signatures')
@Controller('signatures')
export class SignaturesController {
  constructor(
    private readonly signatures: SignaturesService,
    private readonly signers: SignersService,
  ) {}

  // ─────────── Registro público con invitación (sin auth) ───────────

  @Get('invitations/validate')
  @ApiOperation({ summary: 'Valida un token de invitación (público, para el formulario de registro)' })
  validateInvitation(@Query('token') token: string) {
    return this.signers.validateInvitation(token);
  }

  @Post('register')
  @ApiOperation({ summary: 'Auto-registro de firmante con token de invitación (público)' })
  register(@Body() dto: RegisterSignerDto) {
    return this.signers.registerWithInvitation(dto);
  }

  // ─────────── Gestión de usuarios (ADMIN) ───────────

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea un usuario directamente (cualquier rol)' })
  createSigner(@Req() req: any, @Body() dto: CreateSignerDto) {
    return this.signers.createSigner(dto, req.user?.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista los usuarios registrados' })
  listSigners() {
    return this.signers.listSigners();
  }

  @Patch('users/:userId/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inhabilita o reactiva la cuenta de un usuario' })
  setSuspended(@Req() req: any, @Param('userId') userId: string, @Body() body: { suspended: boolean }) {
    return this.signers.setSuspended(userId, body.suspended, req.user?.id);
  }

  @Delete('users/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Elimina definitivamente la cuenta de un usuario' })
  deleteSigner(@Req() req: any, @Param('userId') userId: string) {
    return this.signers.deleteSigner(userId, req.user?.id);
  }

  @Patch('users/:userId/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'El admin restablece la contraseña de un usuario (genera clave temporal)' })
  resetUserPassword(@Req() req: any, @Param('userId') userId: string) {
    return this.signers.resetUserPassword(userId, req.user?.id);
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Genera un link de invitación con token para que el firmante se auto-registre' })
  createInvitation(@Req() req: any, @Body() dto: CreateInvitationDto) {
    return this.signers.createInvitation(req.user.id, dto);
  }

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Elimina una invitación: su link deja de ser válido' })
  deleteInvitation(@Param('id') id: string) {
    return this.signers.deleteInvitation(id);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista las invitaciones emitidas' })
  listInvitations() {
    return this.signers.listInvitations();
  }

  // ─────────── Lotes de firma ───────────

  @Post('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crea un lote de firma con documentos generados y lo envía al circuito decano→director' })
  createBatch(@Req() req: any, @Body() dto: CreateSignatureBatchDto) {
    return this.signatures.createBatch(dto.documentIds, req.user.id, dto.name);
  }

  @Get('signed-zip')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ZIP con los certificados firmados: todos los lotes completados o los ids indicados' })
  downloadSignedZip(@Query('ids') ids: string, @Res() res: Response) {
    const batchIds = ids ? ids.split(',').filter(Boolean) : undefined;
    return this.signatures.streamSignedZip(res, batchIds);
  }

  @Get('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista todos los lotes de firma con su avance' })
  findBatches() {
    return this.signatures.findBatches();
  }

  @Delete('batches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Anula un lote de firma que no se ha completado' })
  cancelBatch(@Param('id') id: string) {
    return this.signatures.cancelBatch(id);
  }

  @Get('batches/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SIGNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lotes pendientes de la firma del usuario logueado' })
  findPending(@Req() req: any) {
    return this.signatures.findPendingForSigner(req.user.id);
  }

  @Get('batches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle de un lote de firma' })
  findBatch(@Param('id') id: string) {
    return this.signatures.findBatch(id);
  }

  @Get('batches/:id/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Descarga el ZIP del lote para firmar con FirmaEC' })
  downloadBatch(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    return this.signatures.streamBatchZip(id, req.user.id, req.user.role, res);
  }

  @Post('batches/:id/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SIGNER)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 500, {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB por PDF
  }))
  @ApiOperation({ summary: 'Sube los PDFs firmados; el sistema verifica firma, checksum y avanza el circuito' })
  uploadSigned(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFiles() files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
  ) {
    return this.signatures.uploadSignedFiles(id, req.user.id, files);
  }

  @Post('batches/:id/items/:itemId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SIGNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rechaza un documento del lote con motivo' })
  rejectItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body('reason') reason: string,
  ) {
    return this.signatures.rejectItem(id, itemId, req.user.id, reason);
  }

  @Get('batches/:id/items/:itemId/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR, Role.SIGNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'URL prefirmada del archivo individual de un ítem' })
  downloadItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.signatures.getItemDownloadUrl(id, itemId);
  }
}

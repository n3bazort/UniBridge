import { Controller, Post, Get, Delete, Param, Query, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req, Patch, ForbiddenException } from '@nestjs/common';
import { DocumentTemplatesService } from './document-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreatePdfTemplateDto } from './dto/create-pdf-template.dto';
import { CreateDocxTemplateDto } from './dto/create-docx-template.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';

@ApiTags('document-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly service: DocumentTemplatesService) {}

  @Post('pdf')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Crear template PDF (JSON visual designer)' })
  createPdf(@Body() body: CreatePdfTemplateDto, @Req() req: any) {
    const facultyId = req.user?.facultyId || body.facultyId;
    return this.service.createPdfTemplate(body.name, body.content, facultyId);
  }

  @Post('pdf/:id') // Using POST to act as PUT or better yet @Put('pdf/:id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Actualizar template PDF existente' })
  async updatePdf(@Param('id') id: string, @Body() body: CreatePdfTemplateDto, @Req() req: any) {
    const template = await this.service.findOne(id);
    const isDefault = template.name === 'Certificado de Prácticas Oficial' || (template.content as any)?.isDefault === true;
    if (isDefault && req.user?.role === Role.COORDINATOR) {
      throw new ForbiddenException('La plantilla predeterminada solo puede ser modificada por el Administrador.');
    }
    return this.service.updatePdfTemplate(id, body.name, body.content);
  }

  @Post('docx')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Subir archivo template DOCX (se almacena en MinIO)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (extname(file.originalname).toLowerCase() === '.docx') {
        return cb(null, true);
      }
      return cb(new BadRequestException('Solo se permiten archivos .docx'), false);
    }
  }))
  createDocx(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateDocxTemplateDto,
    @Req() req: any
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const facultyId = req.user?.facultyId || body.facultyId;
    return this.service.createDocxTemplate(body.name, file.buffer, file.originalname, facultyId);
  }

  @Post('upload-image')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Subir imagen de fondo para templates PDF (se almacena en MinIO)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Solo se permiten imágenes (JPG, PNG, GIF, WEBP)'), false);
      }
    }
  }))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Imagen requerida');
    // Devuelve la key durable (para guardar) y una URL prefirmada (para vista previa)
    return this.service.uploadBackgroundImage(file.buffer, file.originalname, file.mimetype);
  }

  @Get('bg-url')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'URL prefirmada de una imagen de fondo almacenada en MinIO' })
  getBackgroundUrl(@Query('key') key: string) {
    return this.service.getBackgroundUrl(key);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Listar templates' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/set-default')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Marcar plantilla como predeterminada (desmarca todas las demás de su tipo)' })
  setDefault(@Param('id') id: string) {
    return this.service.setDefault(id);
  }

  @Patch(':id/docx-config')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Configurar numeración del oficio' })
  updateDocxConfig(@Param('id') id: string, @Body() body: { docTypeAbbr?: string; codeSuffix?: string; codePrefix?: string }) {
    return this.service.updateDocxConfig(id, body);
  }

  @Patch(':id/rename')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Renombrar una plantilla' })
  async rename(@Param('id') id: string, @Body() body: { name: string }, @Req() req: any) {
    const template = await this.service.findOne(id);
    const isDefault = template.name === 'Certificado de Prácticas Oficial' || (template.content as any)?.isDefault === true;
    if (isDefault && req.user?.role === Role.COORDINATOR) {
      throw new ForbiddenException('La plantilla predeterminada solo puede ser modificada por el Administrador.');
    }
    return this.service.rename(id, body.name);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  async remove(@Param('id') id: string, @Req() req: any) {
    const template = await this.service.findOne(id);
    const isDefault = template.name === 'Certificado de Prácticas Oficial' || (template.content as any)?.isDefault === true;
    if (isDefault && req.user?.role === Role.COORDINATOR) {
      throw new ForbiddenException('La plantilla predeterminada solo puede ser eliminada por el Administrador.');
    }
    return this.service.remove(id);
  }
}

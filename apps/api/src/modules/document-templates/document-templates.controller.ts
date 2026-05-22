import { Controller, Post, Get, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req, Patch } from '@nestjs/common';
import { DocumentTemplatesService } from './document-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreatePdfTemplateDto } from './dto/create-pdf-template.dto';
import { CreateDocxTemplateDto } from './dto/create-docx-template.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
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
  updatePdf(@Param('id') id: string, @Body() body: CreatePdfTemplateDto) {
    return this.service.updatePdfTemplate(id, body.name, body.content);
  }

  @Post('docx')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Subir archivo template DOCX físico' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/templates',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname));
      }
    }),
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
    return this.service.createDocxTemplate(body.name, file.path, facultyId);
  }

  @Post('upload-image')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Subir imagen de fondo para templates PDF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads/images',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'bg-' + uniqueSuffix + extname(file.originalname));
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Solo se permiten imágenes (JPG, PNG, GIF)'), false);
      }
    }
  }))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Imagen requerida');
    return { url: `/uploads/images/${file.filename}` };
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

  @Patch(':id/rename')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Renombrar una plantilla' })
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.service.rename(id, body.name);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COORDINATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

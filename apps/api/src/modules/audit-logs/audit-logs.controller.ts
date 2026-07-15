import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @ApiOperation({ summary: 'Listar logs de auditoría recientes (solo Admin/Coordinator)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Número de registros (default: 20)' })
  @ApiQuery({ name: 'tableName', required: false, type: String, description: 'Filtrar por tabla' })
  async findAll(
    @Query('limit') limit?: string,
    @Query('tableName') tableName?: string,
  ) {
    const take = Math.min(parseInt(limit || '20', 10), 100); // Máximo 100

    return this.prisma.auditLog.findMany({
      where: tableName ? { tableName } : undefined,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        tableName: true,
        recordId: true,
        userId: true,
        createdAt: true,
        // No exponer newData para evitar filtrar datos sensibles
      },
    });
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly cls: ClsService) {
    super();
    // Middleware Global de Prisma
    this.$use(async (params, next) => {
      // 1. Extraer el contexto actual (Evita crashes cuando Prisma corre en Workers asíncronos sin HTTP)
      const isActive = this.cls.isActive();
      const userId = isActive ? this.cls.get('userId') : null;
      const facultyId = isActive ? this.cls.get('facultyId') : null;

      // 2. Multi-tenancy Lógico Automático
      // Los modelos que deben ser filtrados por facultad (ej. Practices, Students, Coordinators)
      const tenantModels = ['Coordinator', 'Student', 'Practice']; 
      if (facultyId && tenantModels.includes(params.model) && params.action.startsWith('find')) {
        if (!params.args) params.args = {};
        if (!params.args.where) params.args.where = {};
        // Forzamos el filtro a la facultad del usuario actual
        params.args.where.facultyId = facultyId;
      }

      const softDeleteModels = ['User', 'Faculty', 'Coordinator', 'Program', 'Student', 'Company', 'Practice', 'DocumentTemplate', 'GeneratedDocument'];

      // 3. Soft Delete Middleware
      if (softDeleteModels.includes(params.model)) {
        if (params.action == 'delete') {
          params.action = 'update';
          params.args['data'] = { deletedAt: new Date() };
        }
        if (params.action == 'deleteMany') {
          params.action = 'updateMany';
          if (params.args.data != undefined) {
            params.args.data['deletedAt'] = new Date();
          } else {
            params.args['data'] = { deletedAt: new Date() };
          }
        }

        // Ocultar registros eliminados
        if (params.action === 'findMany' || params.action === 'findFirst') {
          if (!params.args) params.args = {};
          if (!params.args.where) params.args.where = {};
          if (params.args.where.deletedAt === undefined) {
            params.args.where['deletedAt'] = null;
          }
        }
      }

      const result = await next(params);

      // 4. Audit Log Automático
      if (['create', 'update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)) {
         if (params.model !== 'AuditLog') { 
            const recordId = result?.id || params.args?.where?.id || '00000000-0000-0000-0000-000000000000';
            
            this.auditLog.create({
              data: {
                action: params.action,
                tableName: params.model || 'Unknown',
                recordId: recordId,
                newData: params.args?.data || {},
                userId: userId // ¡Capturado mágicamente por CLS desde el JWT!
              }
            }).catch(e => this.logger.error('Error al guardar Audit Log', e));
         }
      }

      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Successfully connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

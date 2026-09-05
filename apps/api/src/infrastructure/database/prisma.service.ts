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
            // `recordId` es una columna UUID. Una operación por lote afecta a
            // varios registros, así que se escribe una fila de auditoría por
            // cada uno: concatenar los ids en una sola cadena hacía fallar el
            // insert entero, y la operación quedaba sin rastro justo en las
            // acciones masivas —envío a firma, invalidación de un oficio
            // grupal, importación— que más conviene poder reconstruir.
            const recordIds = this.extraerRecordIds(result, params.args?.where?.id);

            const comun = {
              action: params.action,
              tableName: params.model || 'Unknown',
              newData: params.args?.data || {},
              userId: userId // ¡Capturado mágicamente por CLS desde el JWT!
            };

            this.auditLog.createMany({
              data: recordIds.map((recordId) => ({ ...comun, recordId })),
            }).catch(e => this.logger.error('Error al guardar Audit Log', e));
         }
      }

      return result;
    });
  }

  /** UUID de relleno para operaciones cuyo registro afectado no se puede identificar. */
  private static readonly UUID_NULO = '00000000-0000-0000-0000-000000000000';

  private static readonly RE_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Ids de los registros que alcanzó la operación, listos para la columna UUID.
   *
   * Un `create` los trae en el resultado; un `update` puntual, en `where.id`;
   * una operación por lote, en `where.id.in`. Cuando el `where` no permite
   * identificarlos —por ejemplo un `updateMany` filtrado por otro campo—, se
   * deja una sola fila con el UUID de relleno: se pierde el detalle de qué
   * registros cambiaron, pero la operación queda asentada.
   */
  private extraerRecordIds(result: any, whereId: unknown): string[] {
    const esUuid = (v: unknown): v is string =>
      typeof v === 'string' && PrismaService.RE_UUID.test(v);

    const candidato = result?.id ?? whereId;
    if (esUuid(candidato)) return [candidato];

    if (candidato && typeof candidato === 'object' && Array.isArray((candidato as any).in)) {
      const ids = (candidato as any).in.filter(esUuid);
      if (ids.length > 0) return ids;
    }

    return [PrismaService.UUID_NULO];
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Successfully connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

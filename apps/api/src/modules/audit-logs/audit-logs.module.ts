import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}

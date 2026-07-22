import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ClsModule } from 'nestjs-cls';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { envValidationSchema } from './infrastructure/config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FacultiesModule } from './modules/faculties/faculties.module';
import { CoordinatorsModule } from './modules/coordinators/coordinators.module';
import { QueuesModule } from './modules/queues/queues.module';
import { StudentsModule } from './modules/students/students.module';
import { PracticesModule } from './modules/practices/practices.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ExcelImportsModule } from './modules/excel-imports/excel-imports.module';
import { DocumentEngineModule } from './modules/document-engine/document-engine.module';
import { DocumentTemplatesModule } from './modules/document-templates/document-templates.module';
import { GeneratedDocumentsModule } from './modules/generated-documents/generated-documents.module';
import { TenancyInterceptor } from './common/interceptors/tenancy.interceptor';
import { AcademicPeriodsModule } from './modules/academic-periods/academic-periods.module';
import { MinioModule } from './modules/minio/minio.module';
import { OpenSearchModule } from './modules/opensearch/opensearch.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { SignaturesModule } from './modules/signatures/signatures.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,   // 1 minuto
        limit: 3000,  // máx 3000 requests por minuto por IP (aumentado para evitar 429 en desarrollo)
      },
      {
        name: 'auth',
        ttl: 900000,  // 15 minutos
        limit: 10,    // máx 10 intentos de login por 15 minutos
      },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    FacultiesModule,
    CoordinatorsModule,
    QueuesModule,
    StudentsModule,
    PracticesModule,
    ProgramsModule,
    CompaniesModule,
    ExcelImportsModule,
    DocumentEngineModule,
    DocumentTemplatesModule,
    GeneratedDocumentsModule,
    AcademicPeriodsModule,
    MinioModule,
    OpenSearchModule,
    AuditLogsModule,
    SignaturesModule,
    ReportsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Rate limiting global en todos los endpoints
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenancyInterceptor,
    },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExcelImportsService } from './excel-imports.service';
import { ExcelImportsController } from './excel-imports.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'excel-import' }),
  ],
  controllers: [ExcelImportsController],
  providers: [ExcelImportsService],
})
export class ExcelImportsModule {}

import { Module } from '@nestjs/common';
import { AcademicPeriodsController } from './academic-periods.controller';
import { AcademicPeriodsService } from './academic-periods.service';

@Module({
  controllers: [AcademicPeriodsController],
  providers: [AcademicPeriodsService]
})
export class AcademicPeriodsModule {}

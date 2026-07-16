import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { SignersService } from './signers.service';
import { PracticesModule } from '../practices/practices.module';

@Module({
  // Al completarse las firmas, la práctica pasa a "Finalizado" (estado derivado)
  imports: [PracticesModule],
  controllers: [SignaturesController],
  providers: [SignaturesService, SignersService],
  exports: [SignaturesService, SignersService],
})
export class SignaturesModule {}

import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { SignersService } from './signers.service';

@Module({
  controllers: [SignaturesController],
  providers: [SignaturesService, SignersService],
  exports: [SignaturesService, SignersService],
})
export class SignaturesModule {}

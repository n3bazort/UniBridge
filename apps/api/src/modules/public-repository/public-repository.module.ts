import { Module } from '@nestjs/common';
import { PublicRepositoryService } from './public-repository.service';
import { PublicRepositoryController, ReturnedDocumentsController } from './public-repository.controller';
import { MinioModule } from '../minio/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [PublicRepositoryController, ReturnedDocumentsController],
  providers: [PublicRepositoryService],
  exports: [PublicRepositoryService],
})
export class PublicRepositoryModule {}

import { Module } from '@nestjs/common';
import { PracticesService } from './practices.service';
import { PracticesController } from './practices.controller';
import { TutorsModule } from '../tutors/tutors.module';

@Module({
  // El tope de veinte del RF-22 se comprueba al reasignar, y la regla vive
  // en un solo sitio: el servicio de tutores.
  imports: [TutorsModule],
  controllers: [PracticesController],
  providers: [PracticesService],
  exports: [PracticesService],
})
export class PracticesModule {}

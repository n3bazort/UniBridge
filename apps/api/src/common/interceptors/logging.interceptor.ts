import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Rutas que se consultan en bucle y no aportan nada al registro.
 *
 * Mientras se genera un lote, la tarjeta de progreso pregunta una vez por
 * segundo cuánto lleva. Registrar cada pregunta llena el log de decenas de
 * lineas identicas justo durante la operacion que uno querria poder leer.
 * El resultado del lote se registra igual desde el procesador de la cola.
 */
const RUTAS_SILENCIADAS = [/\/progress$/];

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const now = Date.now();

    const silenciada = RUTAS_SILENCIADAS.some((patron) => patron.test(url.split('?')[0]));

    return next
      .handle()
      .pipe(
        tap(() => {
          if (!silenciada) {
            this.logger.log(`[${method}] ${url} - ${Date.now() - now}ms`);
          }
        }),
      );
  }
}

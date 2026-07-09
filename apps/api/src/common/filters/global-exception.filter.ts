import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Traducir errores conocidos de Prisma a respuestas HTTP limpias
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          const fields = (exception.meta?.target as string[])?.join(', ') ?? 'campo';
          message = `Ya existe un registro con el mismo valor en: ${fields}`;
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = (exception.meta?.cause as string) ?? 'Registro no encontrado';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referencia inválida: el registro relacionado no existe';
          break;
        case 'P2014':
          status = HttpStatus.BAD_REQUEST;
          message = 'La operación violaría una restricción de relación requerida';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = `Error de base de datos (${exception.code})`;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos enviados a la base de datos';
    }

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Message: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

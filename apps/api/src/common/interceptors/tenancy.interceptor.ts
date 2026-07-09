import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Esto lo inyecta el JwtAuthGuard automáticamente

    if (user) {
      if (user.id) {
        this.cls.set('userId', user.id);
      }
      if (user.facultyId) {
        // Los coordinadores tendrán facultyId, permitiendo el aislamiento de datos.
        this.cls.set('facultyId', user.facultyId);
      }
    }

    return next.handle();
  }
}

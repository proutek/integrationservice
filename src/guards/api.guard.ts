import { Injectable, CanActivate, ExecutionContext, Request } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

@Injectable()
export class ApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const key = context.switchToHttp().getRequest<Request>()?.headers?.['x-api-key'];
    return key === this.configService.get('X-API-KEY1');
  }
}

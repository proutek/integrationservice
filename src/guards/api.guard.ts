import { Injectable, CanActivate, ExecutionContext, Request } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

@Injectable()
export class ApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const key1 = context.switchToHttp().getRequest<Request>()?.headers?.['x-api-key'];
    const key2 = this.configService.get('X_API_KEY1');
    return key1 === key2;
  }
}

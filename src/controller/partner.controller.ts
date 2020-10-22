import { Controller, HttpCode, Post, Request as Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IntegrationService } from '../service/integration.service';

@Controller('/api')
export class PartnerController {
  constructor(private readonly integrationService: IntegrationService, private readonly configService: ConfigService) {}

  @Post('orders')
  @HttpCode(200)
  orders(@Req() request: Request): void {
    this.integrationService.orders(request.body);
  }
}

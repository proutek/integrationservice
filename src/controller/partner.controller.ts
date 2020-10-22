import { Controller, HttpCode, Post, Request as Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ApiGuard } from '../guards/api.guard';
import { IntegrationService } from '../service/integration.service';

@Controller('/api')
@UseGuards(ApiGuard)
export class PartnerController {
  constructor(private readonly integrationService: IntegrationService, private readonly configService: ConfigService) {}

  @Post('orders')
  @HttpCode(200)
  orders(@Req() request: Request): void {
    this.integrationService.orders(request.body);
  }
}

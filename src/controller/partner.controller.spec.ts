import { Test, TestingModule } from '@nestjs/testing';

import { IntegrationService } from '../service/integration.service';
import { PartnerController } from './partner.controller';

describe('PartnerController', () => {
  let appController: PartnerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [PartnerController],
      providers: [IntegrationService],
    }).compile();

    const partnerController = app.get<PartnerController>(PartnerController);
  });

  // describe('root', () => {
  //   it('should return "Hello World!"', () => {
  //     expect(appController.getHello()).toBe('Hello World!');
  //   });
  // });
});

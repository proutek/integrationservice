import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnerController } from '../controller/partner.controller';
import { Order, OrderSchema } from '../schemas/order.schema';
import { IntegrationService } from '../service/integration.service';
import { OrderService } from '../service/order.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const host = configService.get('MONGO_DB_HOST');
        const db = configService.get('MONGO_DB_NAME');
        const user = configService.get('MONGO_DB_USER');
        const password = configService.get('MONGO_DB_PASSWORD');
        return {
          uri: `mongodb+srv://${user}:${password}@${host}/${db}?retryWrites=true&w=majority`,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [PartnerController],
  providers: [IntegrationService, OrderService],
})
export class AppModule {}

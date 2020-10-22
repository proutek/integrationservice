import { NestFactory } from '@nestjs/core';
import { AppModule } from './module/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(80);
}
bootstrap();

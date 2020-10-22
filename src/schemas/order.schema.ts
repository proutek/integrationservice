import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OrderState } from '../common.ts/enums';

@Schema()
export class Detail {
  @Prop()
  productId: number;

  @Prop()
  name: string;

  @Prop()
  quantity: number;

  @Prop()
  weight: number;

  @Prop()
  eanCode: string;
}

export type DetailDocument = Detail & Document;

export const DetailSchema = SchemaFactory.createForClass(Detail);

@Schema()
export class Order {
  @Prop()
  orderInput: string;

  @Prop()
  needFix: boolean;

  @Prop()
  needFixReason: string;

  @Prop()
  state: OrderState;

  @Prop()
  receivedState: string;

  @Prop()
  id: number;

  @Prop()
  fullName: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop()
  addressLine1: string;

  @Prop()
  addressLine2: string;

  @Prop()
  company: string;

  @Prop()
  zipCode: string;

  @Prop()
  city: string;

  @Prop()
  country: string;

  @Prop()
  carrierKey: string;

  @Prop()
  status: string;

  @Prop()
  details: [Detail];
}

export type OrderDocument = Order & Document;

export const OrderSchema = SchemaFactory.createForClass(Order);

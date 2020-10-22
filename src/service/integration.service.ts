import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { Model } from 'mongoose';
import { CARRIERS } from '../common.ts/carriers';
import { COUNTRY_CODES } from '../common.ts/countryCodes';
import { OrderState } from '../common.ts/enums';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderService } from './order.service';

const ordersSchema = Joi.object({
  id: Joi.number().required(),
  fullName: Joi.string().required(),
  email: Joi.string()
    .email()
    .required(),
  phone: Joi.string().required(),
  addressLine1: Joi.string().required(),
  addressLine2: Joi.string()
    .optional()
    .allow(null),
  company: Joi.string()
    .optional()
    .allow(null),
  zipCode: Joi.string().required(),
  city: Joi.string().required(),
  country: Joi.string(),
  carrierKey: Joi.string(),
  status: Joi.string(),
  details: Joi.array().has(
    Joi.object({
      productId: Joi.number().required(),
      name: Joi.string(),
      quantity: Joi.number().required(),
      weight: Joi.number(),
      eanCode: Joi.string(),
    })
  ),
});

@Injectable()
export class IntegrationService {
  constructor(
    private readonly orderService: OrderService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>
  ) {}

  // Validate incoming order
  validateOrder(
    order: Record<string, any>
  ): { needFix: boolean; needFixReason: string | null; value: Record<string, any> } {
    let needFix = false;
    let needFixReason = null;

    const { error, value } = ordersSchema.validate(order);

    if (error) {
      needFix = true;
      needFixReason = error.message;
    } else {
      if (!Object.keys(CARRIERS).includes(value.carrierKey)) {
        needFix = true;
        needFixReason = 'Unknown carrierKey "' + value.carrierKey + '"';
      } else if (!Object.keys(COUNTRY_CODES).includes(value.country)) {
        needFix = true;
        needFixReason = 'Unknown country "' + value.country + '"';
      }
    }

    return { needFix, needFixReason, value };
  }

  async orders(order: Record<string, any>): Promise<void> {
    // Validate structure of document
    const { needFix, needFixReason, value } = this.validateOrder(order);

    let orderInput: string | null = null;

    // In case of error, mark order in DB as broken (requires manual attention)
    if (needFix) {
      orderInput = JSON.stringify(order);
    }

    // Add order
    const createdOrder = new this.orderModel({
      orderInput,
      needFix,
      needFixReason,
      state: OrderState.new,
      ...(!needFix && {
        id: value.id,
        fullName: value.fullName,
        email: value.email,
        phone: value.phone,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2,
        company: value.company,
        zipCode: value.zipCode,
        city: value.city,
        country: value.country,
        carrierKey: value.carrierKey,
        status: value.status,
        details: (value?.details ?? []).map((detail: any) => ({
          productId: detail.productId,
          name: detail.name,
          quantity: detail.quantity,
          weight: detail.weight,
          eanCode: detail.eanCode,
        })),
      }),
    });

    await createdOrder.save();

    this.orderService.triggerProcessingOfNewOrders();
  }
}

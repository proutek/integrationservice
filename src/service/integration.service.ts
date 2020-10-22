import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { Model } from 'mongoose';
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
  validateOrder(order: Record<string, any>) {
    return ordersSchema.validate(order);
  }

  async orders(order: Record<string, any>): Promise<void> {
    const validationResult = this.validateOrder(order);

    let orderInput: string = null;
    let needFix = false;
    let needFixReason: string = null;

    // In case of error, mark order in DB as broken (requires manual attention)
    if (validationResult.error) {
      orderInput = JSON.stringify(order);
      needFix = true;
      needFixReason = validationResult.error?.message;
    } else {
    }

    // Add order
    const createdOrder = new this.orderModel({
      orderInput,
      needFix,
      needFixReason,
      state: OrderState.new,
      ...(!validationResult.error && {
        id: validationResult.value.id,
        fullName: validationResult.value.fullName,
        email: validationResult.value.email,
        phone: validationResult.value.phone,
        addressLine1: validationResult.value.addressLine1,
        addressLine2: validationResult.value.addressLine2,
        company: validationResult.value.company,
        zipCode: validationResult.value.zipCode,
        city: validationResult.value.city,
        country: validationResult.value.country,
        carrierKey: validationResult.value.carrierKey,
        status: validationResult.value.status,
        details: (validationResult.value?.details ?? []).map(detail => ({
          productId: detail.productId,
          name: detail.name,
          quantity: detail.quantity,
          weight: detail.weight,
          eanCode: detail.eanCode,
        })),
      }),
    });

    const orderDocument = await createdOrder.save();

    this.orderService.triggerProcessingOfNewOrders();
  }
}

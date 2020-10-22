import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { EMPTY, from, merge, of, Subject, Subscription, timer } from 'rxjs';
import { ajax, AjaxRequest } from 'rxjs/ajax';
import { catchError, concatMap, exhaustMap, filter, map, mergeAll, mergeMap, tap } from 'rxjs/operators';
import { XMLHttpRequest } from 'xmlhttprequest';
import { CARRIERS } from '../common.ts/carriers';
import { COUNTRY_CODES } from '../common.ts/countryCodes';
import { OrderState } from '../common.ts/enums';
import { Order, OrderDocument } from '../schemas/order.schema';

@Injectable()
export class OrderService implements OnModuleInit, OnApplicationShutdown {
  private newSubject?: Subject<string>;
  private resolvedSubject?: Subject<string>;
  private newSubscription?: Subscription;
  private sentSubscription?: Subscription;
  private resolvedSubscription?: Subscription;
  private token: string;

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly configService: ConfigService
  ) {
    const buffer = Buffer.from(
      configService.get('OP_TIGER_API_USER') + ':' + configService.get('OP_TIGER_API_PASSWORD')
    );
    this.token = buffer.toString('base64');
  }

  async getOrdersByState(state: OrderState): Promise<OrderDocument[]> {
    return await this.orderModel.find({ state, needFix: false });
  }

  async updateOrder(id: string, update: Record<string, any>) {
    return await this.orderModel.updateOne({ _id: id }, update);
  }

  // Handle new orders, start infinite loop triggered every minute or when new order is received.
  initNewOrdersProcessing() {
    this.newSubject = new Subject();
    this.newSubscription = merge(timer(2000, 60000), this.newSubject)
      .pipe(
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.new)).pipe(
            filter(orders => orders.length > 0),
            tap(() => Logger.log('Processing NEW orders...')),
            mergeAll(),
            map(orderDocument => ({
              orderDocument,
              tigerRequest: this.prepareTigerRequestForNewOrder(orderDocument),
            })),
            concatMap(data => {
              const orderId = data.orderDocument._id;
              return ajax(data.tigerRequest).pipe(
                map(response => {
                  if (response.status === 200) {
                    return from(this.updateOrder(orderId, { state: OrderState.sent }));
                  } else {
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: response.responseText,
                      })
                    );
                  }
                }),
                catchError(exception => {
                  const status = exception?.xhr?.status;
                  const responseText = exception?.xhr?.responseText;

                  if (status === 400) {
                    if (responseText === 'Order already exists.') {
                      Logger.warn('Order ' + orderId + ' already exists. Mark it as sent.');
                      return from(this.updateOrder(orderId, { state: OrderState.sent }));
                    } else if (responseText === 'Invalid data.') {
                      Logger.warn('Invalid data. Marking order ' + orderId + ' as broken in DB.');
                      return from(
                        this.updateOrder(orderId, {
                          needFix: true,
                          needFixReason: responseText,
                        })
                      );
                    }
                  }

                  // Skip now and try again later. Don't mark it as broken in DB.
                  Logger.warn(exception?.message);
                  return EMPTY;
                })
              );
            }),
            catchError(exception => {
              Logger.error(exception?.message);
              return EMPTY;
            })
          )
        ),
        catchError(exception => {
          Logger.error(exception);
          return EMPTY;
        })
      )
      .subscribe();
  }

  // Check state of orders already in production. Start infinite loop triggered every minute.
  initSentOrdersProcessing() {
    this.sentSubscription = timer(20000, 60000)
      .pipe(
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.sent)).pipe(
            // Nothing to do!
            filter(orders => orders.length > 0),
            tap(() => Logger.log('Processing SENT orders...')),
            // Flatten array
            mergeAll(),
            // Prepare request
            map(orderDocument => ({
              orderDocument,
              tigerRequest: this.prepareTigerRequestForOrderState(orderDocument),
            })),

            // Execute requests 1 by 1
            concatMap(data => {
              const orderId = data.orderDocument._id;
              return ajax(data.tigerRequest).pipe(
                mergeMap(response => {
                  const receivedState = response?.response?.State;
                  if (response.status === 200) {
                    return from(
                      this.updateOrder(orderId, {
                        ...(receivedState === 'Finished' && { state: OrderState.resolved }),
                        receivedState,
                      })
                    ).pipe(
                      mergeMap(() => {
                        return of(this.triggerProcessingOfResolvedOrders());
                      })
                    );
                  } else {
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: response.responseText,
                      })
                    );
                  }
                }),
                catchError(exception => {
                  const status = exception?.xhr?.status;
                  const responseText = exception?.xhr?.responseText;

                  // Order does not exist - mark it as broken
                  if (status === 400) {
                    Logger.warn('Bad request when checking order. Marking order ' + orderId + ' as broken in DB.');
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: responseText,
                      })
                    );
                  } else if (status === 404) {
                    Logger.warn('Order does not exist but should! Marking order ' + orderId + ' as broken in DB.');
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: responseText,
                      })
                    );
                  }

                  // Skip now and try again later. Don't mark it as broken in DB.
                  Logger.warn(exception?.message);
                  return EMPTY;
                })
              );
            }),
            catchError(exception => {
              Logger.warn(exception);
              return EMPTY;
            })
          )
        ),
        catchError(exception => {
          Logger.error(exception);
          return EMPTY;
        })
      )
      .subscribe();
  }

  // Inform partner about finished orders. Start infinite loop triggered every minute.
  initResolvedOrdersProcessing() {
    this.resolvedSubject = new Subject();
    this.resolvedSubscription = merge(timer(40000, 60000), this.resolvedSubject)
      .pipe(
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.resolved)).pipe(
            filter(orders => orders.length > 0),
            tap(() => Logger.log('Processing RESOLVED orders...')),
            mergeAll(),
            map(orderDocument => ({
              orderDocument,
              partnerRequest: this.preparePartnerRequestForFinishedOrder(orderDocument),
            })),
            concatMap(data => {
              const orderId = data.orderDocument._id;
              return ajax(data.partnerRequest).pipe(
                mergeMap(response => {
                  if (response.status === 200) {
                    return from(
                      this.updateOrder(orderId, {
                        state: OrderState.finished,
                      })
                    );
                  } else {
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: response.responseText,
                      })
                    );
                  }
                }),
                catchError(exception => {
                  const status = exception?.xhr?.status;
                  console.log(status);

                  // Order does not exist - mark it as broken
                  if (status === 400) {
                    Logger.warn('Bad request finish order. Marking order ' + orderId + ' as broken in DB.');
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: 'Bad request finish order.',
                      })
                    );
                  } else if (status === 404) {
                    Logger.warn('Order does not exist but should! Marking order ' + orderId + ' as broken in DB.');
                    return from(
                      this.updateOrder(orderId, {
                        needFix: true,
                        needFixReason: 'Order does not exist but should!',
                      })
                    );
                  }

                  // Skip now and try again later. Don't mark it as broken in DB.
                  Logger.warn(exception?.message);
                  return EMPTY;
                })
              );
            }),
            catchError(exception => {
              Logger.warn(exception);
              return EMPTY;
            })
          )
        ),
        catchError(exception => {
          Logger.error(exception);
          return EMPTY;
        })
      )
      .subscribe();
  }

  onModuleInit() {
    this.initNewOrdersProcessing();
    this.initSentOrdersProcessing();
    this.initResolvedOrdersProcessing();
  }

  onApplicationShutdown() {
    this.newSubscription?.unsubscribe();
    this.sentSubscription?.unsubscribe();
    this.resolvedSubscription?.unsubscribe();
  }

  getCarrierID(carrierKey: string): number {
    return CARRIERS[carrierKey];
  }

  createXHR() {
    return new XMLHttpRequest();
  }

  prepareTigerRequestForNewOrder(orderDocument: OrderDocument): AjaxRequest {
    const body = {
      OrderID: orderDocument._id.toString(),
      InvoiceSendLater: false,
      Issued: DateTime.utc().toISO(),
      OrderType: 'standard',
      Shipping: {
        CarrierID: this.getCarrierID(orderDocument.carrierKey),
        DeliveryAddress: {
          AddressLine1: orderDocument.addressLine1,
          ...(orderDocument.addressLine2 && { AddressLine2: orderDocument.addressLine2 }),
          City: orderDocument.city,
          ...(orderDocument.company && { Company: orderDocument.company }),
          CountryCode: COUNTRY_CODES[orderDocument.country],
          Email: orderDocument.email,
          PersonName: orderDocument.fullName,
          Phone: orderDocument.phone,
          State: orderDocument.country,
          Zip: orderDocument.zipCode,
        },
      },
      Products: orderDocument.details.map(detail => ({
        Barcode: detail.eanCode,
        OPTProductID: detail.productId.toString(),
        Qty: detail.quantity,
      })),
    };

    const request: AjaxRequest = {
      createXHR: this.createXHR,
      url: this.configService.get('OP_TIGER_API') + '/api/orders',
      responseType: 'text',
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + this.token,
        'Content-Type': 'application/json',
      },
      body,
    };

    return request;
  }

  prepareTigerRequestForOrderState(orderDocument: OrderDocument): AjaxRequest {
    const request: AjaxRequest = {
      createXHR: this.createXHR,
      url: this.configService.get('OP_TIGER_API') + '/api/orders/' + orderDocument._id + '/state',
      responseType: 'json',
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + this.token,
        'Content-Type': 'application/json',
      },
    };
    return request;
  }

  preparePartnerRequestForFinishedOrder(orderDocument: OrderDocument): AjaxRequest {
    const body = {
      state: orderDocument.receivedState,
    };
    const request: AjaxRequest = {
      createXHR: this.createXHR,
      url: this.configService.get('PARTNER_API') + '/api/orders/' + orderDocument.id,
      responseType: 'text',
      method: 'PATCH',
      headers: {
        'X-API-KEY': this.configService.get('X_API_KEY2'),
        'Content-Type': 'application/json',
      },
      body,
    };

    return request;
  }

  triggerProcessingOfNewOrders(): void {
    this.newSubject?.next('trigger');
  }

  triggerProcessingOfResolvedOrders(): void {
    this.resolvedSubject?.next('trigger');
  }
}

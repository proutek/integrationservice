import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EMPTY, from, interval, merge, Subject, Subscription, timer } from 'rxjs';
import { catchError, exhaustMap, mergeAll, tap } from 'rxjs/operators';
import { OrderState } from '../common.ts/enums';
import { Order, OrderDocument } from '../schemas/order.schema';

@Injectable()
export class OrderService implements OnModuleInit, OnApplicationShutdown {
  private newSubject: Subject<any>;
  private newSubscription: Subscription;
  private sentSubscription: Subscription;
  private resolvedSubscription: Subscription;

  constructor(@InjectModel(Order.name) private orderModel: Model<OrderDocument>) {}

  async getOrdersByState(state: OrderState): Promise<OrderDocument[]> {
    return await this.orderModel.find({ state }).limit(100);
  }

  initNewOrdersProcessing() {
    this.newSubject = new Subject();
    this.newSubscription = merge(timer(1000, 60000), this.newSubject)
      .pipe(
        tap(() => Logger.log('Processing NEW orders...')),
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.new)).pipe(
            mergeAll(),
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

  initSentOrdersProcessing() {
    this.sentSubscription = timer(20000, 60000)
      .pipe(
        tap(() => Logger.log('Processing SENT orders...')),
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.sent)).pipe(
            mergeAll(),
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

  initResolvedOrdersProcessing() {
    this.resolvedSubscription = timer(40000, 60000)
      .pipe(
        tap(() => Logger.log('Processing RESOLVED orders...')),
        exhaustMap(() =>
          from(this.getOrdersByState(OrderState.resolved)).pipe(
            mergeAll(),
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
    this.resolvedSubscription.unsubscribe();
  }

  getCarrierID(carrierKey: string): number {
    const carriers = {
      DPD: 1001,
      DHL: 1002,
      'DHL Express': 1003,
      UPS: 1004,
      GLS: 1005,
    };

    return carriers[carrierKey];
  }

  triggerProcessingOfNewOrders() {
    this.newSubject.next('trigger');
  }
}

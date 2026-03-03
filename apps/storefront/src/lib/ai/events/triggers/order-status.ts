import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

interface OrderStatusChange {
  customerId: string;
  orderNumber: string;
  previousStatus: string;
  newStatus: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
}

export async function notifyOrderStatusChange(change: OrderStatusChange, channel: 'push' | 'email' | 'sms' = 'push'): Promise<void> {
  await sender.send({
    customerId: change.customerId,
    channel,
    template: 'order_status',
    data: {
      orderNumber: change.orderNumber,
      status: change.newStatus,
      previousStatus: change.previousStatus,
      trackingNumber: change.trackingNumber,
      carrier: change.carrier,
      estimatedDelivery: change.estimatedDelivery,
    },
  });
}

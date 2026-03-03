import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

interface AbandonedCartInfo {
  customerId: string;
  itemCount: number;
  cartTotal: number;
  topItemName?: string;
}

export async function notifyAbandonedCart(info: AbandonedCartInfo, channel: 'push' | 'email' | 'sms' = 'push'): Promise<void> {
  await sender.send({
    customerId: info.customerId,
    channel,
    template: 'abandoned_cart',
    data: {
      itemCount: info.itemCount,
      cartTotal: info.cartTotal,
      topItemName: info.topItemName,
    },
  });
}

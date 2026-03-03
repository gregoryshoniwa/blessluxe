import type { EventSubscription, ProductSummary } from '../../types';
import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

export async function checkPriceDrops(
  subscriptions: EventSubscription[],
  getProduct: (id: string) => Promise<ProductSummary | null>
): Promise<string[]> {
  const triggered: string[] = [];

  for (const sub of subscriptions) {
    if (sub.eventType !== 'price_drop' || !sub.active || !sub.targetId) continue;

    const product = await getProduct(sub.targetId);
    if (!product) continue;

    const priceBelowCondition = sub.conditions?.price_below as number | undefined;
    if (priceBelowCondition != null && product.price > priceBelowCondition) continue;

    if (product.compareAtPrice && product.price < product.compareAtPrice) {
      await sender.send({
        customerId: sub.customerId,
        channel: sub.channel,
        template: 'price_drop',
        data: {
          product,
          oldPrice: product.compareAtPrice,
          newPrice: product.price,
          savings: product.compareAtPrice - product.price,
        },
      });
      triggered.push(sub.id);
    }
  }

  return triggered;
}

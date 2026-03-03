import type { EventSubscription, ProductSummary } from '../../types';
import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

export async function checkNewArrivals(
  subscriptions: EventSubscription[],
  recentProducts: ProductSummary[]
): Promise<string[]> {
  const triggered: string[] = [];

  for (const sub of subscriptions) {
    if (sub.eventType !== 'new_arrival' || !sub.active) continue;

    const matching = recentProducts.filter((p) => {
      if (sub.targetType === 'category' && p.category !== sub.targetId) return false;
      if (sub.targetType === 'style' && !p.tags?.includes(sub.targetId ?? '')) return false;
      return true;
    });

    if (matching.length > 0) {
      await sender.send({
        customerId: sub.customerId,
        channel: sub.channel,
        template: 'new_arrivals',
        data: { products: matching.slice(0, 5) },
      });
      triggered.push(sub.id);
    }
  }

  return triggered;
}

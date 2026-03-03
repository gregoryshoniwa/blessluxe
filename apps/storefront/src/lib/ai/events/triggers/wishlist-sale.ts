import type { EventSubscription, ProductSummary } from '../../types';
import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

export async function checkWishlistSales(
  subscriptions: EventSubscription[],
  getProduct: (id: string) => Promise<ProductSummary | null>
): Promise<string[]> {
  const triggered: string[] = [];

  for (const sub of subscriptions) {
    if (sub.eventType !== 'wishlist_sale' || !sub.active || !sub.targetId) continue;

    const product = await getProduct(sub.targetId);
    if (!product) continue;

    if (product.compareAtPrice && product.price < product.compareAtPrice) {
      const discountPercent = Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
      const requiredDiscount = sub.conditions?.discount_percent as number | undefined;
      if (requiredDiscount && discountPercent < requiredDiscount) continue;

      await sender.send({
        customerId: sub.customerId,
        channel: sub.channel,
        template: 'wishlist_sale',
        data: { product, discountPercent, savings: product.compareAtPrice - product.price },
      });
      triggered.push(sub.id);
    }
  }

  return triggered;
}

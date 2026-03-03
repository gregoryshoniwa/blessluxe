import type { EventSubscription, ProductSummary } from '../../types';
import { NotificationSender } from '../notification-sender';

const sender = new NotificationSender();

export async function checkBackInStock(
  subscriptions: EventSubscription[],
  getProduct: (id: string) => Promise<ProductSummary | null>
): Promise<string[]> {
  const triggered: string[] = [];

  for (const sub of subscriptions) {
    if (sub.eventType !== 'back_in_stock' || !sub.active || !sub.targetId) continue;

    const product = await getProduct(sub.targetId);
    if (!product || !product.inStock) continue;

    const requiredSizes = sub.conditions?.sizes as string[] | undefined;
    if (requiredSizes?.length && product.variants) {
      const availableSizes = product.variants
        .filter((v) => v.inventoryQuantity > 0)
        .map((v) => v.options.size?.toLowerCase());
      const hasSize = requiredSizes.some((s) => availableSizes.includes(s.toLowerCase()));
      if (!hasSize) continue;
    }

    await sender.send({
      customerId: sub.customerId,
      channel: sub.channel,
      template: 'back_in_stock',
      data: { product },
    });
    triggered.push(sub.id);
  }

  return triggered;
}

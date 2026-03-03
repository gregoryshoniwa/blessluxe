import type { EventSubscription, Reminder, ProductSummary } from '../types';
import { NotificationSender } from './notification-sender';
import { checkPriceDrops } from './triggers/price-drop';
import { checkBackInStock } from './triggers/back-in-stock';
import { checkWishlistSales } from './triggers/wishlist-sale';
import { checkNewArrivals } from './triggers/new-arrivals';

const subscriptions: EventSubscription[] = [];
const reminders: Reminder[] = [];

export class EventManager {
  private sender = new NotificationSender();

  addSubscription(sub: EventSubscription): void {
    subscriptions.push(sub);
  }

  removeSubscription(id: string): void {
    const idx = subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) subscriptions.splice(idx, 1);
  }

  getSubscriptions(customerId: string): EventSubscription[] {
    return subscriptions.filter((s) => s.customerId === customerId);
  }

  addReminder(reminder: Reminder): void {
    reminders.push(reminder);
  }

  cancelReminder(id: string): void {
    const r = reminders.find((rm) => rm.id === id);
    if (r) r.status = 'cancelled';
  }

  getReminders(customerId: string): Reminder[] {
    return reminders.filter((r) => r.customerId === customerId && r.status === 'pending');
  }

  async processAll(
    getProduct: (id: string) => Promise<ProductSummary | null>,
    recentProducts: ProductSummary[]
  ): Promise<{ triggeredSubscriptions: string[]; sentReminders: string[] }> {
    const active = subscriptions.filter((s) => s.active);

    const [priceDrops, backInStock, wishlistSales, newArrivals] = await Promise.all([
      checkPriceDrops(active, getProduct),
      checkBackInStock(active, getProduct),
      checkWishlistSales(active, getProduct),
      checkNewArrivals(active, recentProducts),
    ]);

    const allTriggered = [...priceDrops, ...backInStock, ...wishlistSales, ...newArrivals];

    for (const id of allTriggered) {
      const sub = subscriptions.find((s) => s.id === id);
      if (sub) {
        sub.triggeredCount++;
        sub.lastTriggeredAt = new Date().toISOString();
        if (sub.eventType === 'back_in_stock') sub.active = false;
      }
    }

    const sentReminders: string[] = [];
    const now = new Date();
    for (const r of reminders) {
      if (r.status === 'pending' && new Date(r.scheduledFor) <= now) {
        await this.sender.send({
          customerId: r.customerId,
          channel: r.channel,
          template: 'reminder',
          data: { message: r.message, context: r.context },
        });
        r.status = 'sent';
        sentReminders.push(r.id);
      }
    }

    return { triggeredSubscriptions: allTriggered, sentReminders };
  }
}

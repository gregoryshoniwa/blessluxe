import type { NotificationChannel } from '../types';

interface NotificationPayload {
  customerId: string;
  channel: NotificationChannel;
  template: string;
  data: Record<string, unknown>;
}

export class NotificationSender {
  async send(payload: NotificationPayload): Promise<boolean> {
    switch (payload.channel) {
      case 'email':
        return this.sendEmail(payload);
      case 'push':
        return this.sendPush(payload);
      case 'sms':
        return this.sendSMS(payload);
      default:
        console.warn(`[NotificationSender] Unknown channel: ${payload.channel}`);
        return false;
    }
  }

  private async sendEmail(payload: NotificationPayload): Promise<boolean> {
    // In production, call SendGrid / SMTP via the Medusa backend
    console.log(`[Email] Sending ${payload.template} to customer ${payload.customerId}`, payload.data);
    return true;
  }

  private async sendPush(payload: NotificationPayload): Promise<boolean> {
    // In production, call OneSignal or Firebase Cloud Messaging
    console.log(`[Push] Sending ${payload.template} to customer ${payload.customerId}`, payload.data);

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const title = this.getTitle(payload.template);
      const body = this.getBody(payload.template, payload.data);
      new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
    }

    return true;
  }

  private async sendSMS(payload: NotificationPayload): Promise<boolean> {
    // In production, call Twilio or similar
    console.log(`[SMS] Sending ${payload.template} to customer ${payload.customerId}`, payload.data);
    return true;
  }

  private getTitle(template: string): string {
    const titles: Record<string, string> = {
      price_drop: 'Price Drop Alert! 💰',
      back_in_stock: 'Back In Stock! ✨',
      new_arrivals: 'New Arrivals For You 👗',
      wishlist_sale: 'Wishlist Item On Sale! 🎉',
      reminder: 'BLESSLUXE Reminder',
      abandoned_cart: 'Your Cart Misses You 🛍️',
      order_status: 'Order Update',
    };
    return titles[template] || 'BLESSLUXE';
  }

  private getBody(template: string, data: Record<string, unknown>): string {
    switch (template) {
      case 'price_drop': {
        const product = data.product as { title?: string } | undefined;
        return `${product?.title ?? 'An item you love'} just dropped in price!`;
      }
      case 'back_in_stock': {
        const product = data.product as { title?: string } | undefined;
        return `${product?.title ?? 'An item you wanted'} is back in stock.`;
      }
      case 'new_arrivals': {
        const products = data.products as { length?: number } | undefined;
        return `${products?.length ?? 'Some'} new pieces just arrived that match your style.`;
      }
      case 'reminder':
        return (data.message as string) || 'You have a reminder from BLESSLUXE.';
      case 'abandoned_cart':
        return "You left some beautiful pieces in your cart. They're waiting for you!";
      default:
        return 'You have an update from BLESSLUXE.';
    }
  }
}

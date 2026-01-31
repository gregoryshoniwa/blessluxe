import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type {
  CreatePaymentProviderSession,
  PaymentProviderError,
  PaymentProviderSessionResponse,
  UpdatePaymentProviderSession,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/types";

type PaystackOptions = {
  secret_key: string;
};

const PAYSTACK_API = "https://api.paystack.co";

class PaystackPaymentProviderService extends AbstractPaymentProvider<PaystackOptions> {
  static identifier = "paystack";
  protected options_: PaystackOptions;

  constructor(container: Record<string, unknown>, options: PaystackOptions) {
    super(container, options);
    this.options_ = options;
  }

  private async paystackRequest(
    path: string,
    method: string = "GET",
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${PAYSTACK_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.options_.secret_key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  async initiatePayment(
    input: CreatePaymentProviderSession,
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    const { amount, currency_code, context } = input;

    const response = await this.paystackRequest(
      "/transaction/initialize",
      "POST",
      {
        amount: Math.round(amount * 100), // Paystack expects amount in lowest denomination
        currency: currency_code.toUpperCase(),
        email: (context?.customer as Record<string, string>)?.email ?? "",
        metadata: {
          session_id: context?.session_id,
        },
      },
    );

    const data = response.data as Record<string, unknown>;

    return {
      data: {
        reference: data?.reference,
        authorization_url: data?.authorization_url,
        access_code: data?.access_code,
      },
    };
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<
    | PaymentProviderError
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const reference = paymentSessionData.reference as string;
    const response = await this.paystackRequest(
      `/transaction/verify/${reference}`,
    );

    const data = response.data as Record<string, string>;
    const status =
      data?.status === "success"
        ? PaymentSessionStatus.AUTHORIZED
        : PaymentSessionStatus.PENDING;

    return {
      status,
      data: { ...paymentSessionData, ...data },
    };
  }

  async capturePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    // Paystack auto-captures on authorization
    return { ...paymentSessionData, captured: true };
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const reference = paymentSessionData.reference as string;
    const verifyRes = await this.paystackRequest(
      `/transaction/verify/${reference}`,
    );
    const txData = verifyRes.data as Record<string, unknown>;

    const response = await this.paystackRequest("/refund", "POST", {
      transaction: txData.id,
      amount: Math.round(refundAmount * 100),
    });

    return { ...paymentSessionData, refund: response.data };
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    return { ...paymentSessionData, cancelled: true };
  }

  async deletePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    return paymentSessionData;
  }

  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentSessionStatus> {
    const reference = paymentSessionData.reference as string;

    if (!reference) {
      return PaymentSessionStatus.PENDING;
    }

    const response = await this.paystackRequest(
      `/transaction/verify/${reference}`,
    );
    const data = response.data as Record<string, string>;

    switch (data?.status) {
      case "success":
        return PaymentSessionStatus.AUTHORIZED;
      case "failed":
        return PaymentSessionStatus.ERROR;
      default:
        return PaymentSessionStatus.PENDING;
    }
  }

  async retrievePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    return paymentSessionData;
  }

  async updatePayment(
    input: UpdatePaymentProviderSession,
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    return { data: input.data };
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload,
  ): Promise<WebhookActionResult> {
    const event = payload.payload as Record<string, unknown>;
    const eventType = event.event as string;
    const data = event.data as Record<string, unknown>;

    switch (eventType) {
      case "charge.success":
        return {
          action: PaymentActions.SUCCESSFUL,
          data: {
            session_id: (
              data.metadata as Record<string, string>
            )?.session_id,
            amount: (data.amount as number) / 100,
          },
        };
      default:
        return { action: PaymentActions.NOT_SUPPORTED };
    }
  }
}

export default PaystackPaymentProviderService;

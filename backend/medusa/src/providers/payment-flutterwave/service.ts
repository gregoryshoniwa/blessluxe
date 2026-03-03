// @ts-nocheck
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

type FlutterwaveOptions = {
  secret_key: string;
  encryption_key?: string;
};

const FLUTTERWAVE_API = "https://api.flutterwave.com/v3";

class FlutterwavePaymentProviderService extends AbstractPaymentProvider<FlutterwaveOptions> {
  static identifier = "flutterwave";
  protected options_: FlutterwaveOptions;

  constructor(
    container: Record<string, unknown>,
    options: FlutterwaveOptions,
  ) {
    super(container, options);
    this.options_ = options;
  }

  private async flwRequest(
    path: string,
    method: string = "GET",
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${FLUTTERWAVE_API}${path}`, {
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

    const txRef = `blessluxe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const response = await this.flwRequest("/payments", "POST", {
      tx_ref: txRef,
      amount,
      currency: currency_code.toUpperCase(),
      customer: {
        email: (context?.customer as Record<string, string>)?.email ?? "",
      },
      redirect_url: (context?.extra as Record<string, string>)?.return_url,
      meta: {
        session_id: context?.session_id,
      },
    });

    const data = response.data as Record<string, unknown>;

    return {
      data: {
        tx_ref: txRef,
        flw_ref: data?.flw_ref,
        link: data?.link,
      },
    };
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<
    | PaymentProviderError
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const txRef = paymentSessionData.tx_ref as string;

    const response = await this.flwRequest(
      `/transactions/verify_by_reference?tx_ref=${txRef}`,
    );
    const data = response.data as Record<string, string>;

    const status =
      data?.status === "successful"
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
    // Flutterwave auto-captures on authorization for standard payments
    return { ...paymentSessionData, captured: true };
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number,
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const transactionId = paymentSessionData.id as number;

    const response = await this.flwRequest(
      `/transactions/${transactionId}/refund`,
      "POST",
      { amount: refundAmount },
    );

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
    const txRef = paymentSessionData.tx_ref as string;

    if (!txRef) {
      return PaymentSessionStatus.PENDING;
    }

    const response = await this.flwRequest(
      `/transactions/verify_by_reference?tx_ref=${txRef}`,
    );
    const data = response.data as Record<string, string>;

    switch (data?.status) {
      case "successful":
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
      case "charge.completed":
        if ((data.status as string) === "successful") {
          return {
            action: PaymentActions.SUCCESSFUL,
            data: {
              session_id: (data.meta as Record<string, string>)?.session_id,
              amount: data.amount as number,
            },
          };
        }
        return { action: PaymentActions.FAILED };
      default:
        return { action: PaymentActions.NOT_SUPPORTED };
    }
  }
}

export default FlutterwavePaymentProviderService;

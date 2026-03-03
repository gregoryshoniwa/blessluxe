// @ts-nocheck
import { AbstractNotificationProviderService } from "@medusajs/framework/utils";
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type InjectedDependencies = {
  logger: Logger;
};

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth_user: string;
  auth_pass: string;
  from: string;
  /** Optional TLS config: set to false to allow self-signed certs in dev */
  tls_reject_unauthorized?: boolean;
};

class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "smtp";
  protected logger_: Logger;
  protected options_: SmtpOptions;
  protected transporter_: Transporter;

  constructor({ logger }: InjectedDependencies, options: SmtpOptions) {
    super();
    this.logger_ = logger;
    this.options_ = options;

    this.transporter_ = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: {
        user: options.auth_user,
        pass: options.auth_pass,
      },
      tls: {
        rejectUnauthorized: options.tls_reject_unauthorized ?? true,
      },
    });
  }

  static validateOptions(options: Record<string, unknown>) {
    const required = ["host", "port", "auth_user", "auth_pass", "from"];
    for (const key of required) {
      if (!options[key]) {
        throw new Error(
          `SMTP notification provider requires "${key}" in options`,
        );
      }
    }
  }

  async send(
    notification: ProviderSendNotificationDTO,
  ): Promise<ProviderSendNotificationResultsDTO> {
    const { to, template, data } = notification;

    const subject =
      (data?.subject as string) || template || "Notification from BLESSLUXE";
    const html =
      (data?.html as string) ||
      (data?.body as string) ||
      `<p>${JSON.stringify(data)}</p>`;
    const text = (data?.text as string) || undefined;

    try {
      const info = await this.transporter_.sendMail({
        from: this.options_.from,
        to,
        subject,
        html,
        text,
        attachments: notification.attachments?.map((a) => ({
          filename: a.name,
          content: a.content,
          contentType: a.content_type,
          href: a.url,
        })),
      });

      this.logger_.info(`SMTP email sent to ${to}: ${info.messageId}`);

      return { id: info.messageId };
    } catch (error) {
      this.logger_.error(`SMTP email failed to ${to}: ${error}`);
      throw error;
    }
  }
}

export default SmtpNotificationProviderService;

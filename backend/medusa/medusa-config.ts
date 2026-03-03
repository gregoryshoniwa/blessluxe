import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const isSecureCookies = process.env.COOKIE_SECURE === "true";

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    cookieOptions: {
      secure: isSecureCookies,
      sameSite: isSecureCookies ? "none" as const : "lax" as const,
    },
  },
  admin: {
    disable: process.env.DISABLE_ADMIN === "true",
  },
  modules: [
    // --- File storage: Cloudinary ---
    // Uncomment when you have Cloudinary credentials
    ...(process.env.CLOUDINARY_CLOUD_NAME
      ? [
          {
            resolve: "@medusajs/medusa/file",
            options: {
              providers: [
                {
                  resolve: "./src/providers/file-cloudinary",
                  id: "cloudinary",
                  options: {
                    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                    api_key: process.env.CLOUDINARY_API_KEY,
                    api_secret: process.env.CLOUDINARY_API_SECRET,
                  },
                },
              ],
            },
          },
        ]
      : []),

    // --- Payment: Stripe + Paystack + Flutterwave ---
    // Only load when at least one payment key is set
    ...(process.env.STRIPE_API_KEY ||
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.FLUTTERWAVE_SECRET_KEY
      ? [
          {
            resolve: "@medusajs/medusa/payment",
            options: {
              providers: [
                ...(process.env.STRIPE_API_KEY
                  ? [
                      {
                        resolve: "@medusajs/medusa/payment-stripe",
                        id: "stripe",
                        options: {
                          apiKey: process.env.STRIPE_API_KEY,
                          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
                        },
                      },
                    ]
                  : []),
                ...(process.env.PAYSTACK_SECRET_KEY
                  ? [
                      {
                        resolve: "./src/providers/payment-paystack",
                        id: "paystack",
                        options: {
                          secret_key: process.env.PAYSTACK_SECRET_KEY,
                        },
                      },
                    ]
                  : []),
                ...(process.env.FLUTTERWAVE_SECRET_KEY
                  ? [
                      {
                        resolve: "./src/providers/payment-flutterwave",
                        id: "flutterwave",
                        options: {
                          secret_key: process.env.FLUTTERWAVE_SECRET_KEY,
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        ]
      : []),

    // --- Notifications: SendGrid + SMTP ---
    // Only load when at least one notification key is set
    ...(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST
      ? [
          {
            resolve: "@medusajs/medusa/notification",
            options: {
              providers: [
                ...(process.env.SENDGRID_API_KEY
                  ? [
                      {
                        resolve: "@medusajs/medusa/notification-sendgrid",
                        id: "sendgrid",
                        options: {
                          channels: ["email"],
                          api_key: process.env.SENDGRID_API_KEY,
                          from: process.env.SENDGRID_FROM,
                        },
                      },
                    ]
                  : []),
                ...(process.env.SMTP_HOST
                  ? [
                      {
                        resolve: "./src/providers/notification-smtp",
                        id: "smtp",
                        options: {
                          channels: ["email"],
                          host: process.env.SMTP_HOST,
                          port: Number(process.env.SMTP_PORT || 587),
                          secure: process.env.SMTP_SECURE === "true",
                          auth_user: process.env.SMTP_USER,
                          auth_pass: process.env.SMTP_PASS,
                          from: process.env.SMTP_FROM,
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        ]
      : []),

    // --- Custom modules ---
    {
      resolve: "./src/modules/affiliate",
    },
    {
      resolve: "./src/modules/customer-extended",
    },
    {
      resolve: "./src/modules/product-review",
    },
  ],
});

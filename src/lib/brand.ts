export const brand = {
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "Operations Platform",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@example.com",
  tagline: "Clear work. Verified execution. Real-time visibility.",
} as const;

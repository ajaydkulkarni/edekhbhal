import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  jsonb,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", [
  "ADMIN",
  "SITE_MANAGER",
  "USER",
]);

export const recordStatus = pgEnum("record_status", ["ACTIVE", "INACTIVE"]);

export const commercialMode = pgEnum("commercial_mode", [
  "FREE",
  "SPONSORED",
  "TRIAL",
  "PAID",
  "CUSTOM_CONTRACT",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "ACTIVE",
  "PENDING_PAYMENT",
  "GRACE",
  "SUSPENDED",
  "CANCELLED",
]);

export const organizations = pgTable("organization", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull(),
  defaultCurrencyCode: text("default_currency_code").notNull(),
  defaultTimezone: text("default_timezone").notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
});

export const appUsers = pgTable("app_user", {
  id: uuid("id").defaultRandom().primaryKey(),
  authSubject: text("auth_subject").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  preferredLanguage: text("preferred_language").default("en").notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMemberships = pgTable(
  "organization_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    roleCode: membershipRole("role_code").notNull(),
    status: recordStatus("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
  },
  (table) => [
    uniqueIndex("organization_membership_org_user_uq").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_membership_user_idx").on(table.userId),
    index("organization_membership_org_idx").on(table.organizationId),
  ],
);

export const planCatalog = pgTable("plan_catalog", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  commercialMode: commercialMode("commercial_mode").notNull(),
  monthlyPriceUsdCents: bigint("monthly_price_usd_cents", { mode: "number" })
    .default(0)
    .notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  description: text("description"),
});

export const organizationSubscriptions = pgTable(
  "organization_subscription",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    planCode: text("plan_code")
      .notNull()
      .references(() => planCatalog.code),
    commercialMode: commercialMode("commercial_mode").notNull(),
    status: subscriptionStatus("status").default("ACTIVE").notNull(),
    billingProvider: text("billing_provider"),
    providerCustomerRef: text("provider_customer_ref"),
    providerSubscriptionRef: text("provider_subscription_ref"),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
  },
  (table) => [
    uniqueIndex("organization_subscription_active_org_uq").on(table.organizationId),
    index("organization_subscription_plan_idx").on(table.planCode),
  ],
);

export const sites = pgTable(
  "site",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    timezone: text("timezone").notNull(),
    addressLine1: text("address_line1"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    countryCode: text("country_code").notNull(),
    status: recordStatus("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
  },
  (table) => [
    uniqueIndex("site_org_code_uq").on(table.organizationId, table.code),
    index("site_org_idx").on(table.organizationId),
  ],
);

export const auditEvents = pgTable(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    timestampUtc: timestamp("timestamp_utc", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id),
    actorMembershipId: uuid("actor_membership_id").references(
      () => organizationMemberships.id,
    ),
    actorDisplayNameSnapshot: text("actor_display_name_snapshot"),
    ipAddress: text("ip_address"),
    moduleCode: text("module_code").notNull(),
    actionCode: text("action_code").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    oldValueJson: jsonb("old_value_json"),
    newValueJson: jsonb("new_value_json"),
    requestId: text("request_id"),
    correlationId: text("correlation_id"),
    sourceChannel: text("source_channel").notNull(),
    reason: text("reason"),
  },
  (table) => [
    index("audit_event_org_time_idx").on(table.organizationId, table.timestampUtc),
    index("audit_event_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: bigint("attempt_count", { mode: "number" }).default(0).notNull(),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("outbox_event_idempotency_uq").on(table.idempotencyKey),
    index("outbox_event_pending_idx").on(table.processedAt, table.availableAt),
  ],
);

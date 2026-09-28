import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const siteContent = sqliteTable("site_content", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const editorAccounts = sqliteTable("editor_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
  passwordHash: text("password_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until"),
}, (table) => [
  check("editor_accounts_valid_role", sql`${table.role} IN ('owner', 'member')`),
  uniqueIndex("editor_accounts_single_owner").on(table.role).where(sql`${table.role} = 'owner'`),
]);

export const editorSessions = sqliteTable("editor_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => editorAccounts.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const aiRequestLimits = sqliteTable("ai_request_limits", {
  ownerId: text("owner_id").primaryKey(),
  windowStart: integer("window_start").notNull(),
  requestCount: integer("request_count").notNull(),
});

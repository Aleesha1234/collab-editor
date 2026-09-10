import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerInitials: text("owner_initials").notNull(),
  ownerColor: text("owner_color").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;

export const activityTable = pgTable("activity_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorInitials: text("actor_initials").notNull(),
  actorColor: text("actor_color").notNull(),
  documentName: text("document_name").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityEvent = typeof activityTable.$inferSelect;
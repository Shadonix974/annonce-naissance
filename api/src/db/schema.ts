import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, pgTable, smallint, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

export const tweaks = pgTable("tweaks", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    accessToken: text("access_token").notNull(),
    tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ singleton: check("settings_singleton", sql`${t.id} = 1`) }),
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    section: text("section").notNull(),
    position: integer("position").notNull().default(0),
    alt: text("alt").notNull().default(""),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    blurhash: text("blurhash"),
    version: integer("version").notNull().default(1),
    cropped: boolean("cropped").notNull().default(false),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sectionCheck: check("photos_section_check", sql`${t.section} IN ('triptych','gallery')`),
    byPos: index("photos_section_pos").on(t.section, t.position),
  }),
);

export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rangeText: text("range_text").notNull(),
    url: text("url"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    takenBy: text("taken_by"),
    takenNote: text("taken_note"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byPos: index("gifts_position").on(t.position) }),
);

export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateLabel: text("date_label").notNull(),
  text: text("text").notNull(),
  position: integer("position").notNull().default(0),
  isNow: boolean("is_now").notNull().default(false),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    token: text("token").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => ({ byExpiry: index("sessions_expires").on(t.expiresAt) }),
);

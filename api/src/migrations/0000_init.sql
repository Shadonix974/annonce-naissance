CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"range_text" text NOT NULL,
	"url" text,
	"photo_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"taken_by" text,
	"taken_note" text,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"blurhash" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_section_check" CHECK ("photos"."section" IN ('triptych','gallery'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"token_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_label" text NOT NULL,
	"text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_now" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tweaks" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gifts" ADD CONSTRAINT "gifts_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gifts_position" ON "gifts" USING btree ("position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_section_pos" ON "photos" USING btree ("section","position");
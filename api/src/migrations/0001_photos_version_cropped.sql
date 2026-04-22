ALTER TABLE "photos" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "cropped" boolean DEFAULT false NOT NULL;
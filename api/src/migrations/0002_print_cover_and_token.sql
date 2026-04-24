ALTER TABLE "photos" DROP CONSTRAINT "photos_section_check";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "print_access_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_section_check" CHECK ("photos"."section" IN ('triptych','gallery','print-cover'));
CREATE TYPE "public"."office" AS ENUM('KUMASI', 'ACCRA', 'TAKORADI');--> statement-breakpoint
-- Rides posted before this migration have no office. Adding the column with a default fills
-- them in (as KUMASI), then the default is dropped so every new ride has to send its office.
ALTER TABLE "rides" ADD COLUMN "office" "office" DEFAULT 'KUMASI' NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "office" DROP DEFAULT;

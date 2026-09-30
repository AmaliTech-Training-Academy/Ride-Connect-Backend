ALTER TABLE "rides" ADD COLUMN "origin_lat" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "origin_lng" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "destination_lat" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "destination_lng" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "waypoints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "route_polyline" text;
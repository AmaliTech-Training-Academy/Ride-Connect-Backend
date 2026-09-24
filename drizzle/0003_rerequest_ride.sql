ALTER TABLE "ride_requests" ADD COLUMN "rejection_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "ride_requests" ADD COLUMN "rerequest_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "ride_requests" ADD COLUMN "rerequest_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD COLUMN "final_rejection_reason" varchar(500);
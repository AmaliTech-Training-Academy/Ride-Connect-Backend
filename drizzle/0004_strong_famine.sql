CREATE TYPE "public"."notification_type" AS ENUM('RIDE_REQUEST_RECEIVED', 'REQUEST_ACCEPTED', 'REQUEST_DECLINED', 'PASSENGER_WITHDREW', 'RIDE_CANCELLED', 'RIDE_UPDATED');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"ride_id" uuid,
	"request_id" uuid,
	"actor_id" uuid,
	"ride_origin" varchar(255),
	"ride_destination" varchar(255),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_ride_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ride_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id_created_at" ON "notifications" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id_unread" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;
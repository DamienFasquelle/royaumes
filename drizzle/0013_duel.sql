CREATE SCHEMA "duel";
--> statement-breakpoint
CREATE TABLE "duel"."active_duels" (
	"duel_id" text PRIMARY KEY NOT NULL,
	"challenger_id" text NOT NULL,
	"challenger_name" text NOT NULL,
	"opponent_id" text NOT NULL,
	"opponent_name" text NOT NULL,
	"training" boolean NOT NULL,
	"stake" jsonb NOT NULL,
	"status" text NOT NULL,
	"issued_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "active_duels_challenger_idx" ON "duel"."active_duels" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "active_duels_opponent_idx" ON "duel"."active_duels" USING btree ("opponent_id");
CREATE TYPE "public"."category_format" AS ENUM('team', 'individual', 'pair');--> statement-breakpoint
CREATE TYPE "public"."competition_level" AS ENUM('club', 'regional', 'national', 'international');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."contribution_target" AS ENUM('participant_member', 'athlete', 'horse', 'participant', 'identity_merge');--> statement-breakpoint
CREATE TYPE "public"."participant_type" AS ENUM('team', 'individual', 'pair');--> statement-breakpoint
CREATE TYPE "public"."phase_kind" AS ENUM('session', 'semifinal', 'final');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('scraped', 'crowdsourced', 'merged');--> statement-breakpoint
CREATE TYPE "public"."source_entity_type" AS ENUM('competition', 'category', 'participant');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('mg-scoreboard', 'pmglivescore');--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"format" "category_format" NOT NULL,
	"age_band" text,
	"pro" boolean DEFAULT false NOT NULL,
	"division" text,
	"label" text,
	"source" "source_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"grouping_key" text NOT NULL,
	"level" "competition_level",
	"nation_id" integer,
	"venue_id" integer,
	"starts_on" date,
	"ends_on" date,
	"organizer" text,
	"source" "source_kind" NOT NULL,
	"source_title_raw" text
);
--> statement-breakpoint
CREATE TABLE "heat" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"number" integer NOT NULL,
	CONSTRAINT "heat_phase_number_uq" UNIQUE("phase_id","number")
);
--> statement-breakpoint
CREATE TABLE "phase" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"kind" "phase_kind" NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text NOT NULL,
	"native_params" jsonb,
	CONSTRAINT "phase_category_kind_ord_uq" UNIQUE("category_id","kind","ordinal")
);
--> statement-breakpoint
CREATE TABLE "contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target" "contribution_target" NOT NULL,
	"target_id" integer,
	"payload" jsonb NOT NULL,
	"status" "contribution_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scrape_target" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source_kind" NOT NULL,
	"url" text NOT NULL,
	"kind" text NOT NULL,
	"category_id" integer,
	"is_live" boolean DEFAULT false NOT NULL,
	"last_scraped_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "source_ref" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source_kind" NOT NULL,
	"entity_type" "source_entity_type" NOT NULL,
	"entity_id" integer NOT NULL,
	"native_id" text NOT NULL,
	"native_url" text,
	CONSTRAINT "source_ref_source_type_native_uq" UNIQUE("source","entity_type","native_id")
);
--> statement-breakpoint
CREATE TABLE "athlete" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_name" text NOT NULL,
	"given_name" text,
	"normalized_name" text NOT NULL,
	"nation_id" integer,
	CONSTRAINT "athlete_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "horse" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	CONSTRAINT "horse_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"type" "participant_type" NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"team_id" integer,
	"athlete_id" integer,
	"nation_id" integer,
	"start_number" integer,
	CONSTRAINT "participant_category_label_uq" UNIQUE("category_id","normalized_label")
);
--> statement-breakpoint
CREATE TABLE "participant_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"athlete_id" integer NOT NULL,
	"horse_id" integer,
	"role" text,
	"provenance" "provenance" DEFAULT 'scraped' NOT NULL,
	CONSTRAINT "participant_member_uq" UNIQUE("participant_id","athlete_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"nation_id" integer,
	"is_club" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	CONSTRAINT "game_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "game_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"source" "source_kind" NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	CONSTRAINT "game_alias_source_norm_uq" UNIQUE("source","normalized_name")
);
--> statement-breakpoint
CREATE TABLE "nation" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "nation_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"nation_id" integer,
	CONSTRAINT "venue_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "game_result" (
	"id" serial PRIMARY KEY NOT NULL,
	"result_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"points" numeric(6, 2) NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "game_result_result_game_uq" UNIQUE("result_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "result" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"phase_id" integer NOT NULL,
	"heat_id" integer,
	"points_total" numeric(6, 2) NOT NULL,
	"penalty_points" numeric(6, 2),
	"rank" integer,
	"is_tie" boolean DEFAULT false NOT NULL,
	CONSTRAINT "result_participant_phase_heat_uq" UNIQUE("participant_id","phase_id","heat_id")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_nation_id_nation_id_fk" FOREIGN KEY ("nation_id") REFERENCES "public"."nation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heat" ADD CONSTRAINT "heat_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase" ADD CONSTRAINT "phase_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD CONSTRAINT "scrape_target_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_nation_id_nation_id_fk" FOREIGN KEY ("nation_id") REFERENCES "public"."nation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_nation_id_nation_id_fk" FOREIGN KEY ("nation_id") REFERENCES "public"."nation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_member" ADD CONSTRAINT "participant_member_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_member" ADD CONSTRAINT "participant_member_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_member" ADD CONSTRAINT "participant_member_horse_id_horse_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_nation_id_nation_id_fk" FOREIGN KEY ("nation_id") REFERENCES "public"."nation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_alias" ADD CONSTRAINT "game_alias_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue" ADD CONSTRAINT "venue_nation_id_nation_id_fk" FOREIGN KEY ("nation_id") REFERENCES "public"."nation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_result" ADD CONSTRAINT "game_result_result_id_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_result" ADD CONSTRAINT "game_result_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_heat_id_heat_id_fk" FOREIGN KEY ("heat_id") REFERENCES "public"."heat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_competition_idx" ON "category" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "category_format_idx" ON "category" USING btree ("format");--> statement-breakpoint
CREATE INDEX "competition_source_group_idx" ON "competition" USING btree ("source","grouping_key");--> statement-breakpoint
CREATE INDEX "scrape_target_live_stale_idx" ON "scrape_target" USING btree ("is_live","last_scraped_at");
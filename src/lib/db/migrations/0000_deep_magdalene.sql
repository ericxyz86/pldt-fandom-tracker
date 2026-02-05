CREATE TYPE "public"."content_type" AS ENUM('post', 'video', 'reel', 'tweet', 'thread');--> statement-breakpoint
CREATE TYPE "public"."discovery_status" AS ENUM('discovered', 'dismissed', 'tracked', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."fandom_tier" AS ENUM('emerging', 'trending', 'existing');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'tiktok', 'facebook', 'youtube', 'twitter', 'reddit');--> statement-breakpoint
CREATE TYPE "public"."scrape_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "ai_discovered_fandoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"fandom_group" text,
	"suggested_tier" "fandom_tier" NOT NULL,
	"size_score" integer NOT NULL,
	"sustainability_score" integer NOT NULL,
	"growth_score" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"estimated_size" text NOT NULL,
	"sustainability_rating" text NOT NULL,
	"growth_potential" text NOT NULL,
	"key_behavior" text NOT NULL,
	"engagement_potential" text NOT NULL,
	"community_tone" text NOT NULL,
	"rationale" text NOT NULL,
	"suggested_platforms" text[] NOT NULL,
	"suggested_demographics" text[] NOT NULL,
	"suggested_handles" text[] NOT NULL,
	"verified_followers" text DEFAULT '[]' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"status" "discovery_status" DEFAULT 'discovered' NOT NULL,
	"tracked_fandom_id" uuid,
	"generated_at" timestamp NOT NULL,
	"dismissed_at" timestamp,
	CONSTRAINT "ai_discovered_fandoms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_page_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text NOT NULL,
	"insights" text NOT NULL,
	"generated_at" timestamp NOT NULL,
	CONSTRAINT "ai_page_insights_page_unique" UNIQUE("page")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fandom_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"content_type" "content_type" NOT NULL,
	"text" text,
	"url" text,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fandom_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fandom_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"handle" text NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "fandoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tier" "fandom_tier" NOT NULL,
	"description" text,
	"image_url" text,
	"fandom_group" text,
	"demographic_tags" text[] DEFAULT '{}' NOT NULL,
	"ai_key_behavior" text,
	"ai_engagement_potential" text,
	"ai_community_tone" text,
	"ai_rationale" text,
	"ai_suggested_action" text,
	"ai_generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fandoms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "google_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fandom_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"date" date NOT NULL,
	"interest_value" integer DEFAULT 0 NOT NULL,
	"region" text DEFAULT 'PH' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fandom_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"followers" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(12, 4) DEFAULT '0' NOT NULL,
	"profile_url" text,
	"avatar_url" text,
	"bio" text,
	"relevance_score" numeric(5, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fandom_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"date" date NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"posts_count" integer DEFAULT 0 NOT NULL,
	"engagement_total" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(12, 4) DEFAULT '0' NOT NULL,
	"growth_rate" numeric(12, 4) DEFAULT '0' NOT NULL,
	"avg_likes" integer DEFAULT 0 NOT NULL,
	"avg_comments" integer DEFAULT 0 NOT NULL,
	"avg_shares" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"fandom_id" uuid,
	"platform" "platform",
	"status" "scrape_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"items_count" integer DEFAULT 0 NOT NULL,
	"apify_run_id" text
);
--> statement-breakpoint
ALTER TABLE "ai_discovered_fandoms" ADD CONSTRAINT "ai_discovered_fandoms_tracked_fandom_id_fandoms_id_fk" FOREIGN KEY ("tracked_fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fandom_platforms" ADD CONSTRAINT "fandom_platforms_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_trends" ADD CONSTRAINT "google_trends_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_fandom_id_fandoms_id_fk" FOREIGN KEY ("fandom_id") REFERENCES "public"."fandoms"("id") ON DELETE no action ON UPDATE no action;
-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255),
    "full_name" TEXT,
    "phone_number" VARCHAR(20),
    "company_name" TEXT,
    "registration_number" TEXT,
    "address" TEXT,
    "gst_document_url" TEXT,
    "pan_document_url" TEXT,
    "totalbookings" INTEGER,
    "lastbooking" DATE,
    "totalspent" VARCHAR(20),
    "status" VARCHAR(20),
    "joindate" DATE,
    "google_id" VARCHAR(255),
    "email_verified" BOOLEAN DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR,
    "password" VARCHAR
);

-- CreateTable
CREATE TABLE "publishers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "total_billboards" INTEGER,
    "revenue" TEXT,
    "status" TEXT,
    "join_date" DATE,
    "password" VARCHAR(255) NOT NULL DEFAULT '',
    "role" TEXT,
    "address" TEXT,
    "business_info" JSONB,
    "business_type" TEXT,
    "city" TEXT,
    "company_name" TEXT,
    "pincode" TEXT,
    "state" TEXT,
    "website" TEXT,
    "google_id" VARCHAR(255),

    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billboards" (
    "id" TEXT NOT NULL DEFAULT nextval('billboards_id_seq'::regclass),
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "type" TEXT,
    "orientation" TEXT,
    "daily_viewership" INTEGER,
    "price_per_day" INTEGER,
    "available" BOOLEAN DEFAULT true,
    "size_width" INTEGER,
    "size_height" INTEGER,
    "size_unit" TEXT,
    "size_category" TEXT,
    "images" TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "unit" TEXT,
    "category" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "user_id" TEXT,
    "ad_duration" TEXT,
    "opening_time" TEXT,
    "closing_time" TEXT,
    "max_advertiser_per_day" INTEGER,
    "description" TEXT,
    "resolution" VARCHAR(50),
    "name" TEXT DEFAULT 'NULL',
    "auto_brightness" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT[],
    "status" TEXT DEFAULT 'pending',
    "screen_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "rejection_reason" TEXT,
    "updated_at" TIMESTAMP(3),
    "max_advertise_duration" INTEGER,
    "max_slots_per_day" INTEGER DEFAULT 8,
    "slot_duration" INTEGER DEFAULT 60,
    "slot_start_time" TEXT DEFAULT '09:00',
    "slot_end_time" TEXT DEFAULT '18:00',

    CONSTRAINT "billboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL DEFAULT nextval('campaigns_id_seq'::regclass),
    "user_name" TEXT NOT NULL,
    "campaign_name" TEXT,
    "status" TEXT,
    "total_amount" DECIMAL,
    "start_date" DATE,
    "end_date" DATE,
    "billboards" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_slots" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "billboard_id" TEXT NOT NULL,
    "asset_url" TEXT NOT NULL,
    "start_date" TIMESTAMP(6) NOT NULL,
    "end_date" TIMESTAMP(6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "slot_number" INTEGER,
    "screen_id" TEXT,

    CONSTRAINT "generated_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_play_logs" (
    "id" SERIAL NOT NULL,
    "screen_id" TEXT NOT NULL,
    "asset_url" TEXT NOT NULL,
    "played_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_id" TEXT,

    CONSTRAINT "asset_play_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_plays" (
    "id" SERIAL NOT NULL,
    "screen_id" TEXT NOT NULL,
    "asset_url" TEXT NOT NULL,
    "play_date" DATE NOT NULL,
    "play_count" INTEGER DEFAULT 0,
    "campaign_id" TEXT,

    CONSTRAINT "asset_plays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "assets" TEXT[],

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signage_assets" (
    "id" SERIAL NOT NULL,
    "image_url" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "start_time" TIMESTAMP(6) NOT NULL,
    "end_time" TIMESTAMP(6) NOT NULL,
    "screen_id" TEXT NOT NULL,

    CONSTRAINT "signage_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots" (
    "id" UUID NOT NULL,
    "billboard_id" TEXT NOT NULL,
    "asset_url" TEXT NOT NULL,
    "start_date" TIMESTAMP(6) NOT NULL,
    "end_date" TIMESTAMP(6) NOT NULL,
    "duration" INTEGER,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" SERIAL NOT NULL,
    "personal_info" JSONB NOT NULL,
    "business_info" JSONB NOT NULL,
    "documents" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" VARCHAR(255),
    "google_id" VARCHAR(255),
    "google_picture" TEXT,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_metrics" (
    "id" SERIAL NOT NULL,
    "publisherId" INTEGER NOT NULL,
    "totalBillboards" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "lastBooking" TIMESTAMP(3),
    "status" VARCHAR(20),
    "settings" JSONB,

    CONSTRAINT "publisher_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "superadmin_emails" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "notification_types" TEXT[],
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "superadmin_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_notifications" (
    "id" SERIAL NOT NULL,
    "notification_type" VARCHAR(100) NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "message_id" VARCHAR(255),
    "error_message" TEXT,
    "data" JSONB,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerScreen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machineId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "resolution" TEXT,
    "os" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "statinfo" TEXT DEFAULT 'active',
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerScreen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billboard_availability" (
    "id" SERIAL NOT NULL,
    "billboard_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "availability" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billboard_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultAsset" (
    "id" SERIAL NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "assetName" TEXT,
    "assetType" TEXT DEFAULT 'image',
    "duration" INTEGER DEFAULT 10,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefaultAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billboard_bookings" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "billboard_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_slots" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billboard_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "recipient_email" VARCHAR(255),
    "recipient_role" VARCHAR(50),
    "type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "message" TEXT,
    "entity_type" VARCHAR(50),
    "entity_id" VARCHAR(100),
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_availability" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "billboard_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_slots" INTEGER DEFAULT 8,
    "booked_slots" INTEGER DEFAULT 0,
    "available_slots" INTEGER DEFAULT 8,
    "last_updated" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "publishers_email_key" ON "publishers"("email");

-- CreateIndex
CREATE INDEX "idx_asset_play_logs_campaign" ON "asset_play_logs"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_asset_plays_campaign" ON "asset_plays"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_plays_screen_id_asset_url_play_date_key" ON "asset_plays"("screen_id", "asset_url", "play_date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_plays_unique_slot_per_day" ON "asset_plays"("screen_id", "asset_url", "play_date");

-- CreateIndex
CREATE UNIQUE INDEX "unique_asset_play" ON "asset_plays"("screen_id", "asset_url", "campaign_id", "play_date");

-- CreateIndex
CREATE UNIQUE INDEX "publisher_metrics_publisherId_key" ON "publisher_metrics"("publisherId");

-- CreateIndex
CREATE UNIQUE INDEX "superadmin_emails_email_key" ON "superadmin_emails"("email");

-- CreateIndex
CREATE INDEX "idx_superadmin_emails_active" ON "superadmin_emails"("is_active");

-- CreateIndex
CREATE INDEX "idx_superadmin_emails_email" ON "superadmin_emails"("email");

-- CreateIndex
CREATE INDEX "idx_email_notifications_created_at" ON "email_notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_email_notifications_recipient" ON "email_notifications"("recipient_email");

-- CreateIndex
CREATE INDEX "idx_email_notifications_status" ON "email_notifications"("status");

-- CreateIndex
CREATE INDEX "idx_email_notifications_type" ON "email_notifications"("notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerScreen_machineId_key" ON "PlayerScreen"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerScreen_screenId_key" ON "PlayerScreen"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "billboard_availability_uniq" ON "billboard_availability"("billboard_id", "date");

-- CreateIndex
CREATE INDEX "idx_billboard_bookings_billboard" ON "billboard_bookings"("billboard_id");

-- CreateIndex
CREATE INDEX "idx_billboard_bookings_campaign" ON "billboard_bookings"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_billboard_bookings_dates" ON "billboard_bookings"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_billboard_bookings_status" ON "billboard_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billboard_bookings_billboard_id_campaign_id_start_date_end__key" ON "billboard_bookings"("billboard_id", "campaign_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_is_read" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_recipient" ON "notifications"("recipient_email", "recipient_role");

-- CreateIndex
CREATE INDEX "idx_slot_availability_billboard" ON "slot_availability"("billboard_id");

-- CreateIndex
CREATE INDEX "idx_slot_availability_date" ON "slot_availability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "slot_availability_billboard_id_date_key" ON "slot_availability"("billboard_id", "date");

-- AddForeignKey
ALTER TABLE "publisher_metrics" ADD CONSTRAINT "publisher_metrics_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "publishers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


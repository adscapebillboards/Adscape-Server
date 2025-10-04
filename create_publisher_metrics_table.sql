CREATE TABLE IF NOT EXISTS "publisher_metrics" (
    "id" SERIAL PRIMARY KEY,
    "publisherId" INTEGER NOT NULL UNIQUE,
    "totalBillboards" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "lastBooking" TIMESTAMP(3),
    "status" VARCHAR(20),
    "settings" JSONB,
    CONSTRAINT "publisher_metrics_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "publishers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

















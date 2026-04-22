ALTER TABLE "generated_slots" ADD COLUMN "billboard_ids" TEXT[];
ALTER TABLE "generated_slots" ADD COLUMN "screen_id_new" TEXT[];
ALTER TABLE "generated_slots" ADD COLUMN "created_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "generated_slots" ADD COLUMN "updated_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "generated_slots" ADD COLUMN "slots" JSONB;

WITH grouped AS (
  SELECT
    MIN(keep_id_billboard) AS keep_id,
    "campaign_id",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "billboard_id"), NULL) AS billboard_ids,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT screen_id), NULL) AS screen_ids,
    MIN(COALESCE("updated_at", CURRENT_TIMESTAMP)) AS created_date,
    MAX(COALESCE("updated_at", CURRENT_TIMESTAMP)) AS updated_date,
    JSONB_OBJECT_AGG("billboard_id", billboard_slots ORDER BY "billboard_id") AS slots
  FROM (
    SELECT
      "campaign_id",
      "billboard_id",
      MIN("id") AS keep_id_billboard,
      MIN("screen_id") AS screen_id,
      MIN("updated_at") AS updated_at,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', "id",
          'assestUrl', "asset_url",
          'duration', "duration",
          'slotno', "slot_number",
          'createdFor', 'Production',
          'timerange', JSONB_BUILD_OBJECT(
            'startDate', TO_CHAR("start_date", 'DD.MM.YYYY'),
            'endDate', TO_CHAR("end_date", 'DD.MM.YYYY'),
            'startDateIso', TO_CHAR("start_date", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'endDateIso', TO_CHAR("end_date", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )
        )
        ORDER BY "start_date", "slot_number"
      ) AS billboard_slots
    FROM "generated_slots"
    WHERE "billboard_id" IS NOT NULL
    GROUP BY "campaign_id", "billboard_id"
  ) grouped_billboards
  GROUP BY "campaign_id"
)
UPDATE "generated_slots" target
SET
  "billboard_ids" = grouped.billboard_ids,
  "screen_id_new" = grouped.screen_ids,
  "created_date" = grouped.created_date,
  "updated_date" = grouped.updated_date,
  "slots" = grouped.slots
FROM grouped
WHERE target."id" = grouped.keep_id;

DELETE FROM "generated_slots"
WHERE "id" NOT IN (
  SELECT MIN("id")
  FROM "generated_slots"
  GROUP BY "campaign_id"
);

ALTER TABLE "generated_slots" ALTER COLUMN "billboard_ids" SET NOT NULL;
ALTER TABLE "generated_slots" ALTER COLUMN "screen_id_new" SET NOT NULL;
ALTER TABLE "generated_slots" ALTER COLUMN "slots" SET NOT NULL;

ALTER TABLE "generated_slots" DROP COLUMN "billboard_id";
ALTER TABLE "generated_slots" DROP COLUMN "asset_url";
ALTER TABLE "generated_slots" DROP COLUMN "start_date";
ALTER TABLE "generated_slots" DROP COLUMN "end_date";
ALTER TABLE "generated_slots" DROP COLUMN "duration";
ALTER TABLE "generated_slots" DROP COLUMN "updated_at";
ALTER TABLE "generated_slots" DROP COLUMN "slot_number";
ALTER TABLE "generated_slots" DROP COLUMN "screen_id";

ALTER TABLE "generated_slots" RENAME COLUMN "screen_id_new" TO "screen_id";
CREATE UNIQUE INDEX "generated_slots_campaign_id_key" ON "generated_slots"("campaign_id");

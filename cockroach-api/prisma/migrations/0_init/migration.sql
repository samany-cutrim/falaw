-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" STRING NOT NULL,
    "ownerId" STRING NOT NULL,
    "fileName" STRING NOT NULL,
    "mimeType" STRING NOT NULL,
    "sizeBytes" INT4 NOT NULL,
    "data" BYTES NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReport" (
    "id" STRING NOT NULL,
    "clientId" STRING NOT NULL,
    "title" STRING NOT NULL,
    "period" STRING,
    "description" STRING,
    "fileName" STRING NOT NULL,
    "fileUrl" STRING,
    "fileSize" INT4,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stats" JSONB,

    CONSTRAINT "ClientReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodPeriod" (
    "id" STRING NOT NULL,
    "label" STRING NOT NULL,
    "month_year" STRING NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodKpi" (
    "id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "tab_key" STRING NOT NULL,
    "kpi_key" STRING NOT NULL,
    "label" STRING NOT NULL,
    "value" STRING NOT NULL,
    "unit" STRING,
    "trend_pct" FLOAT8,
    "sort_order" INT4 NOT NULL,
    "chart_title" STRING,
    "chart_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodContent" (
    "id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "tab_key" STRING NOT NULL,
    "content_html" STRING NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodHighlight" (
    "id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "icon" STRING,
    "title" STRING NOT NULL,
    "body" STRING,
    "sort_order" INT4 NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodRawData" (
    "id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "filename" STRING NOT NULL,
    "raw_json" JSONB NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodRawData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDashPeriod" (
    "id" STRING NOT NULL,
    "client_id" STRING NOT NULL,
    "label" STRING NOT NULL,
    "month_year" STRING NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDashPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDashKpi" (
    "id" STRING NOT NULL,
    "client_id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "tab_key" STRING NOT NULL,
    "kpi_key" STRING NOT NULL,
    "label" STRING NOT NULL,
    "value" STRING NOT NULL,
    "unit" STRING,
    "trend_pct" FLOAT8,
    "sort_order" INT4 NOT NULL,
    "chart_title" STRING,
    "chart_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDashKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDashContent" (
    "id" STRING NOT NULL,
    "client_id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "tab_key" STRING NOT NULL,
    "content_html" STRING NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDashContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDashHighlight" (
    "id" STRING NOT NULL,
    "client_id" STRING NOT NULL,
    "period_id" STRING NOT NULL,
    "icon" STRING,
    "title" STRING NOT NULL,
    "body" STRING,
    "sort_order" INT4 NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDashHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientReport_clientId_uploadedAt_idx" ON "ClientReport"("clientId", "uploadedAt");

-- CreateIndex
CREATE INDEX "IfoodPeriod_month_year_idx" ON "IfoodPeriod"("month_year");

-- CreateIndex
CREATE INDEX "IfoodKpi_period_id_tab_key_sort_order_idx" ON "IfoodKpi"("period_id", "tab_key", "sort_order");

-- CreateIndex
CREATE INDEX "IfoodContent_period_id_idx" ON "IfoodContent"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "IfoodContent_period_id_tab_key_key" ON "IfoodContent"("period_id", "tab_key");

-- CreateIndex
CREATE INDEX "IfoodHighlight_period_id_sort_order_idx" ON "IfoodHighlight"("period_id", "sort_order");

-- CreateIndex
CREATE INDEX "IfoodRawData_period_id_uploaded_at_idx" ON "IfoodRawData"("period_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "ClientDashPeriod_client_id_month_year_idx" ON "ClientDashPeriod"("client_id", "month_year");

-- CreateIndex
CREATE INDEX "ClientDashKpi_client_id_period_id_tab_key_sort_order_idx" ON "ClientDashKpi"("client_id", "period_id", "tab_key", "sort_order");

-- CreateIndex
CREATE INDEX "ClientDashContent_client_id_period_id_idx" ON "ClientDashContent"("client_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDashContent_client_id_period_id_tab_key_key" ON "ClientDashContent"("client_id", "period_id", "tab_key");

-- CreateIndex
CREATE INDEX "ClientDashHighlight_client_id_period_id_sort_order_idx" ON "ClientDashHighlight"("client_id", "period_id", "sort_order");


-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BLOCKED';

-- AlterEnum
ALTER TYPE "FileAssetModule" ADD VALUE 'TIMECLOCK';

-- CreateEnum
CREATE TYPE "TimeClockEventType" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "TimeClockEntryStatus" AS ENUM ('VALID', 'MANUAL', 'VOIDED');

-- CreateEnum
CREATE TYPE "WorkSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ADJUSTED');

-- CreateTable
CREATE TABLE "TimeClockDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenLast4" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeClockEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "TimeClockEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Tijuana',
    "evidenceFileId" TEXT,
    "status" "TimeClockEntryStatus" NOT NULL DEFAULT 'VALID',
    "notes" TEXT,
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "startEntryId" TEXT NOT NULL,
    "endEntryId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "localDate" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Tijuana',
    "status" "WorkSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "entryId" TEXT,
    "workSessionId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "adjustedById" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeClockDevice_tokenHash_key" ON "TimeClockDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TimeClockDevice_branchId_active_idx" ON "TimeClockDevice"("branchId", "active");

-- CreateIndex
CREATE INDEX "TimeClockDevice_createdById_idx" ON "TimeClockDevice"("createdById");

-- CreateIndex
CREATE INDEX "TimeClockEntry_employeeId_localDate_idx" ON "TimeClockEntry"("employeeId", "localDate");

-- CreateIndex
CREATE INDEX "TimeClockEntry_branchId_localDate_idx" ON "TimeClockEntry"("branchId", "localDate");

-- CreateIndex
CREATE INDEX "TimeClockEntry_deviceId_createdAt_idx" ON "TimeClockEntry"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeClockEntry_status_createdAt_idx" ON "TimeClockEntry"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSession_startEntryId_key" ON "WorkSession"("startEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSession_endEntryId_key" ON "WorkSession"("endEntryId");

-- CreateIndex
CREATE INDEX "WorkSession_employeeId_status_idx" ON "WorkSession"("employeeId", "status");

-- CreateIndex
CREATE INDEX "WorkSession_branchId_localDate_idx" ON "WorkSession"("branchId", "localDate");

-- CreateIndex
CREATE INDEX "WorkSession_startedAt_idx" ON "WorkSession"("startedAt");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_employeeId_createdAt_idx" ON "AttendanceAdjustment"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_branchId_createdAt_idx" ON "AttendanceAdjustment"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_adjustedById_createdAt_idx" ON "AttendanceAdjustment"("adjustedById", "createdAt");

-- AddForeignKey
ALTER TABLE "TimeClockDevice" ADD CONSTRAINT "TimeClockDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockDevice" ADD CONSTRAINT "TimeClockDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TimeClockDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TimeClockDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_startEntryId_fkey" FOREIGN KEY ("startEntryId") REFERENCES "TimeClockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_endEntryId_fkey" FOREIGN KEY ("endEntryId") REFERENCES "TimeClockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TimeClockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

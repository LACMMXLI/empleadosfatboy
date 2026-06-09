-- CreateEnum
CREATE TYPE "TimeClockDeviceRequestStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "TimeClockDeviceRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requestTokenHash" TEXT NOT NULL,
    "requestTokenLast4" TEXT NOT NULL,
    "status" "TimeClockDeviceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "branchId" TEXT,
    "deviceName" TEXT,
    "authorizedDeviceId" TEXT,
    "authorizedById" TEXT,
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockDeviceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeClockDeviceRequest_code_key" ON "TimeClockDeviceRequest"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TimeClockDeviceRequest_requestTokenHash_key" ON "TimeClockDeviceRequest"("requestTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TimeClockDeviceRequest_authorizedDeviceId_key" ON "TimeClockDeviceRequest"("authorizedDeviceId");

-- CreateIndex
CREATE INDEX "TimeClockDeviceRequest_status_expiresAt_idx" ON "TimeClockDeviceRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TimeClockDeviceRequest_branchId_createdAt_idx" ON "TimeClockDeviceRequest"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeClockDeviceRequest_authorizedById_createdAt_idx" ON "TimeClockDeviceRequest"("authorizedById", "createdAt");

-- AddForeignKey
ALTER TABLE "TimeClockDeviceRequest" ADD CONSTRAINT "TimeClockDeviceRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockDeviceRequest" ADD CONSTRAINT "TimeClockDeviceRequest_authorizedDeviceId_fkey" FOREIGN KEY ("authorizedDeviceId") REFERENCES "TimeClockDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockDeviceRequest" ADD CONSTRAINT "TimeClockDeviceRequest_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

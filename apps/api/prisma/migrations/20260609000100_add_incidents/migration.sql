-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTADA', 'VISTA', 'EN_PROCESO', 'RESUELTA', 'CERRADA');

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTADA',
    "employeeId" TEXT,
    "branchId" TEXT NOT NULL,
    "reportedByUserId" TEXT,
    "viewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentMessage" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_folio_key" ON "Incident"("folio");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_employeeId_createdAt_idx" ON "Incident"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_branchId_createdAt_idx" ON "Incident"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_reportedByUserId_createdAt_idx" ON "Incident"("reportedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentMessage_incidentId_createdAt_idx" ON "IncidentMessage"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentMessage_authorId_createdAt_idx" ON "IncidentMessage"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentMessage" ADD CONSTRAINT "IncidentMessage_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentMessage" ADD CONSTRAINT "IncidentMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

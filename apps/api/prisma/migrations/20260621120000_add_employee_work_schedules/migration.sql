CREATE TYPE "OvertimeAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED');

CREATE TABLE "EmployeeWorkSchedule" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "mondayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mondayStart" TEXT NOT NULL DEFAULT '09:00',
    "mondayEnd" TEXT NOT NULL DEFAULT '17:00',
    "tuesdayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tuesdayStart" TEXT NOT NULL DEFAULT '09:00',
    "tuesdayEnd" TEXT NOT NULL DEFAULT '17:00',
    "wednesdayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wednesdayStart" TEXT NOT NULL DEFAULT '09:00',
    "wednesdayEnd" TEXT NOT NULL DEFAULT '17:00',
    "thursdayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "thursdayStart" TEXT NOT NULL DEFAULT '09:00',
    "thursdayEnd" TEXT NOT NULL DEFAULT '17:00',
    "fridayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fridayStart" TEXT NOT NULL DEFAULT '09:00',
    "fridayEnd" TEXT NOT NULL DEFAULT '17:00',
    "saturdayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "saturdayStart" TEXT NOT NULL DEFAULT '09:00',
    "saturdayEnd" TEXT NOT NULL DEFAULT '17:00',
    "sundayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sundayStart" TEXT NOT NULL DEFAULT '09:00',
    "sundayEnd" TEXT NOT NULL DEFAULT '17:00',
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 5,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeWorkSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OvertimeAuthorization" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "status" "OvertimeAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "calculatedMinutes" INTEGER NOT NULL,
    "authorizedMinutes" INTEGER,
    "notes" TEXT,
    "authorizedById" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OvertimeAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeWorkSchedule_employeeId_key" ON "EmployeeWorkSchedule"("employeeId");
CREATE UNIQUE INDEX "OvertimeAuthorization_employeeId_localDate_key" ON "OvertimeAuthorization"("employeeId", "localDate");
CREATE INDEX "OvertimeAuthorization_status_localDate_idx" ON "OvertimeAuthorization"("status", "localDate");

ALTER TABLE "EmployeeWorkSchedule" ADD CONSTRAINT "EmployeeWorkSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

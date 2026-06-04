-- CreateEnum
CREATE TYPE "MovementOrigin" AS ENUM ('EMPLOYEE_REQUEST', 'ADMINISTRATIVE_ACTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementKind" ADD VALUE 'ADMIN_CHARGE';
ALTER TYPE "MovementKind" ADD VALUE 'SHORTAGE_DISCOUNT';
ALTER TYPE "MovementKind" ADD VALUE 'DAMAGE_DISCOUNT';
ALTER TYPE "MovementKind" ADD VALUE 'BALANCE_CORRECTION';
ALTER TYPE "MovementKind" ADD VALUE 'ADMIN_SALARY_ADVANCE';
ALTER TYPE "MovementKind" ADD VALUE 'ADMIN_LOAN';

-- DropForeignKey
ALTER TABLE "Movement" DROP CONSTRAINT "Movement_registeredById_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "affectedEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "origin" "MovementOrigin" NOT NULL DEFAULT 'ADMINISTRATIVE_ACTION',
ADD COLUMN     "requestDevice" TEXT,
ADD COLUMN     "requestIp" TEXT,
ADD COLUMN     "requestUserAgent" TEXT,
ALTER COLUMN "registeredById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Movement_employeeId_origin_idx" ON "Movement"("employeeId", "origin");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_affectedEmployeeId_fkey" FOREIGN KEY ("affectedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

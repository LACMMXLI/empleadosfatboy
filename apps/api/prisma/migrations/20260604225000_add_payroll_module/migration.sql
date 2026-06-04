CREATE TYPE "SalaryType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'DAILY');
CREATE TYPE "PayrollStatus" AS ENUM ('BORRADOR', 'GENERADA', 'PAGADA', 'CANCELADA');

ALTER TABLE "Employee"
ADD COLUMN "salaryAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "salaryType" "SalaryType" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "hireDate" TIMESTAMP(3);

CREATE TABLE "Payroll" (
  "id" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" "PayrollStatus" NOT NULL DEFAULT 'GENERADA',
  "totalGross" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalNet" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "generatedByAdminId" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollItem" (
  "id" TEXT NOT NULL,
  "payrollId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalAdvances" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalInternalConsumption" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalAdminCharges" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalPenalties" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalPositiveAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalNegativeAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollItemMovement" (
  "id" TEXT NOT NULL,
  "payrollItemId" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollItemMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payroll_periodKey_key" ON "Payroll"("periodKey");
CREATE INDEX "Payroll_periodStart_periodEnd_idx" ON "Payroll"("periodStart", "periodEnd");
CREATE INDEX "Payroll_status_idx" ON "Payroll"("status");
CREATE UNIQUE INDEX "PayrollItem_payrollId_employeeId_key" ON "PayrollItem"("payrollId", "employeeId");
CREATE INDEX "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");
CREATE UNIQUE INDEX "PayrollItemMovement_movementId_key" ON "PayrollItemMovement"("movementId");
CREATE INDEX "PayrollItemMovement_payrollItemId_idx" ON "PayrollItemMovement"("payrollItemId");

ALTER TABLE "Payroll"
ADD CONSTRAINT "Payroll_generatedByAdminId_fkey"
FOREIGN KEY ("generatedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollItem"
ADD CONSTRAINT "PayrollItem_payrollId_fkey"
FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollItem"
ADD CONSTRAINT "PayrollItem_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollItemMovement"
ADD CONSTRAINT "PayrollItemMovement_payrollItemId_fkey"
FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollItemMovement"
ADD CONSTRAINT "PayrollItemMovement_movementId_fkey"
FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

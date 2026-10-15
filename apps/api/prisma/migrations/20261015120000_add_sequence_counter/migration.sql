-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

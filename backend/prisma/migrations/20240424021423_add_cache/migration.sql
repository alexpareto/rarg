-- CreateTable
CREATE TABLE "GeneralCache" (
    "cacheKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralCache_pkey" PRIMARY KEY ("cacheKey")
);

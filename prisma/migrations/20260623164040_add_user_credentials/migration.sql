-- CreateTable
CREATE TABLE "UserCredential" (
    "id" SERIAL NOT NULL,
    "userProfileId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" BIGINT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCredential_provider_idx" ON "UserCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredential_userProfileId_provider_key" ON "UserCredential"("userProfileId", "provider");

-- AddForeignKey
ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Pregunta"
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "errorStatus" INTEGER;

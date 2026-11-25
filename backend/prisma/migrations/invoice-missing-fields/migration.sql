-- Add invoice details (PAN, bank details, jurisdiction) to Settings and freight/roundOff to Sale
ALTER TABLE "Settings" ADD COLUMN "panNo" TEXT;
ALTER TABLE "Settings" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Settings" ADD COLUMN "bankAccountNo" TEXT;
ALTER TABLE "Settings" ADD COLUMN "bankBranchIfsc" TEXT;
ALTER TABLE "Settings" ADD COLUMN "jurisdiction" TEXT;

ALTER TABLE "Sale" ADD COLUMN "freightCharges" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "roundOff" DECIMAL(65,30) NOT NULL DEFAULT 0;


-- One free game per ACCOUNT (product decision: each partner gets one at
-- their first sign-in, so a couple starts with two).
--
-- Nullable and with no default: NULL means "the free game is still
-- available", which is exactly what every existing row should mean. A
-- backfill would retroactively spend the free game of everyone who signed
-- up before this rule existed.
ALTER TABLE "User" ADD COLUMN "freeGameUsedAt" TIMESTAMP(3);

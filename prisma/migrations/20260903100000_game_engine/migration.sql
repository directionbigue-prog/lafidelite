-- CreateTable "Question"
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "roundType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable "GameSession"
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "currentRoundNumber" INTEGER NOT NULL DEFAULT 1,
    "currentQuestionNumber" INTEGER NOT NULL DEFAULT 1,
    "phase" TEXT NOT NULL DEFAULT 'PASS_DEVICE',
    "activePlayerRole" TEXT NOT NULL,
    "currentQuestionShownAt" TIMESTAMP(3),
    "jokersRemainingCreator" INTEGER NOT NULL DEFAULT 2,
    "jokersRemainingPartner" INTEGER NOT NULL DEFAULT 2,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable "GameRound"
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "firstPlayerRole" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable "GameRoundQuestion"
CREATE TABLE "GameRoundQuestion" (
    "id" TEXT NOT NULL,
    "gameRoundId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRoundQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Answer"
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "gameRoundQuestionId" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "isSkipped" BOOLEAN NOT NULL DEFAULT false,
    "clientElapsedMs" INTEGER,
    "effectiveElapsedMs" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable "QuestionUsage"
CREATE TABLE "QuestionUsage" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "timesPlayed" INTEGER NOT NULL DEFAULT 1,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable "GameResult"
CREATE TABLE "GameResult" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "coupleScore" INTEGER NOT NULL,
    "complicityLevel" TEXT NOT NULL,
    "creatorTotalScore" INTEGER NOT NULL,
    "partnerTotalScore" INTEGER NOT NULL,
    "creatorMirrorPoints" INTEGER NOT NULL,
    "partnerMirrorPoints" INTEGER NOT NULL,
    "creatorFidelityScore" INTEGER NOT NULL,
    "partnerFidelityScore" INTEGER NOT NULL,
    "alignmentPointsShared" INTEGER NOT NULL,
    "creatorSpeedBonus" INTEGER NOT NULL,
    "partnerSpeedBonus" INTEGER NOT NULL,
    "gapPercent" DOUBLE PRECISION NOT NULL,
    "gapMasked" BOOLEAN NOT NULL,
    "winnerRole" TEXT,
    "conversationPrompts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_slug_key" ON "Question"("slug");

-- CreateIndex
CREATE INDEX "Question_roundType_category_active_idx" ON "Question"("roundType", "category", "active");

-- CreateIndex
CREATE INDEX "GameSession_coupleId_status_idx" ON "GameSession"("coupleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_gameSessionId_roundNumber_key" ON "GameRound"("gameSessionId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GameRoundQuestion_gameRoundId_orderIndex_key" ON "GameRoundQuestion"("gameRoundId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_gameRoundQuestionId_userId_kind_key" ON "Answer"("gameRoundQuestionId", "userId", "kind");

-- CreateIndex
CREATE INDEX "Answer_gameSessionId_idx" ON "Answer"("gameSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionUsage_coupleId_questionId_key" ON "QuestionUsage"("coupleId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionUsage_coupleId_idx" ON "QuestionUsage"("coupleId");

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_gameSessionId_key" ON "GameResult"("gameSessionId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoundQuestion" ADD CONSTRAINT "GameRoundQuestion_gameRoundId_fkey" FOREIGN KEY ("gameRoundId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoundQuestion" ADD CONSTRAINT "GameRoundQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_gameRoundQuestionId_fkey" FOREIGN KEY ("gameRoundQuestionId") REFERENCES "GameRoundQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionUsage" ADD CONSTRAINT "QuestionUsage_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionUsage" ADD CONSTRAINT "QuestionUsage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

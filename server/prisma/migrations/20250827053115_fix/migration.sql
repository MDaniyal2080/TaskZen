-- CreateIndex
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- CreateIndex
CREATE INDEX "boards_createdAt_idx" ON "boards"("createdAt");

-- CreateIndex
CREATE INDEX "boards_isArchived_idx" ON "boards"("isArchived");

-- CreateIndex
CREATE INDEX "cards_createdAt_idx" ON "cards"("createdAt");

-- CreateIndex
CREATE INDEX "cards_isCompleted_idx" ON "cards"("isCompleted");

-- CreateIndex
CREATE INDEX "cards_isCompleted_createdAt_idx" ON "cards"("isCompleted", "createdAt");

-- CreateIndex
CREATE INDEX "cards_isCompleted_dueDate_idx" ON "cards"("isCompleted", "dueDate");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE INDEX "transactions_status_createdAt_idx" ON "transactions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_plan_idx" ON "transactions"("plan");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_isPro_idx" ON "users"("isPro");

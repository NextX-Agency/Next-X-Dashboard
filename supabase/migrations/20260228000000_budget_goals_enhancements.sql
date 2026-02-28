-- Add currency column to budgets
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SRD';

-- Add currency and wallet_id columns to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SRD';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;

-- Add linked_expense_categories to budget_categories (JSON array of expense category IDs)
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS linked_expense_categories TEXT;

-- Add user_id column to activity_logs if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_logs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE activity_logs ADD COLUMN user_id UUID;
  END IF;
END $$;

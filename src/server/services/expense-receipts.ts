import { EXPENSE_RECEIPT_BUCKET } from '@/lib/expense-receipts';
import { createAdminClient } from '@/lib/supabase/admin';

export { EXPENSE_RECEIPT_BUCKET } from '@/lib/expense-receipts';

/** Storage cleanup is best-effort so a transient outage never loses the DB action. */
export async function deleteExpenseReceiptObject(pathname: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .storage.from(EXPENSE_RECEIPT_BUCKET)
      .remove([pathname]);
    if (error) {
      console.error('[media] could not remove an expense receipt object');
      return false;
    }
    return true;
  } catch {
    console.error('[media] could not reach Storage to remove an expense receipt object');
    return false;
  }
}

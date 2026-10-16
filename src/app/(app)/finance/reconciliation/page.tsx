import type { Route } from 'next';
import { redirect } from 'next/navigation';

export default function FinanceReconciliationPage() {
  redirect('/reconciliation' as Route);
}

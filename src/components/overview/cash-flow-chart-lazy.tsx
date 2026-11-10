'use client';

import dynamic from 'next/dynamic';
import type { CashFlowPoint } from './cash-flow-chart';

/**
 * The cash-flow chart, loaded after the page is interactive.
 *
 * The charting library is about a third of the dashboard's JavaScript, and the chart sits below the
 * figures a person opens the Overview to read. Loading it on its own means those figures paint and
 * respond first. The placeholder has the chart's exact height, so nothing moves when it arrives.
 */
const CashFlowChart = dynamic(() => import('./cash-flow-chart').then((m) => m.CashFlowChart), {
  ssr: false,
  loading: () => (
    <div
      aria-busy="true"
      aria-label="Loading chart"
      role="img"
      className="h-[200px] w-full px-1 pt-1 md:h-[220px]"
    />
  ),
});

export function LazyCashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return <CashFlowChart data={data} />;
}

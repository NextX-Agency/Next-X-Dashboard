import type { Metadata } from 'next';
import { BundleManager } from '@/components/forms/bundle-manager';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import { PageHeader } from '@/components/patterns/page-header';
import { listBundleOptions, listSaleVariantOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Bundles' };

export default async function BundlesPage() {
  const [bundles, variants] = await Promise.all([
    listBundleOptions(),
    listSaleVariantOptions(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bundles"
        description="Sell a group of products as one line while NextX tracks component stock and weighted-average cost."
        action={<ExportCsvLink entity="bundles" />}
      />
      <BundleManager bundles={bundles} variants={variants} />
    </div>
  );
}

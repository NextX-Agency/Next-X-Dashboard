import { notFound } from 'next/navigation';
import { ADashboard } from '@/preview/concept-a';
import { BDashboard } from '@/preview/concept-b';
import { CDashboard } from '@/preview/concept-c';

export default async function ConceptDashboard({
  params,
}: {
  params: Promise<{ concept: string }>;
}) {
  const { concept } = await params;
  if (concept === 'a') return <ADashboard />;
  if (concept === 'b') return <BDashboard />;
  if (concept === 'c') return <CDashboard />;
  notFound();
}

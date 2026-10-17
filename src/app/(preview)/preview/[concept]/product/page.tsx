import { notFound } from 'next/navigation';
import { AProduct } from '@/preview/concept-a';
import { BProduct } from '@/preview/concept-b';
import { CProduct } from '@/preview/concept-c';

export default async function ConceptProduct({
  params,
}: {
  params: Promise<{ concept: string }>;
}) {
  const { concept } = await params;
  if (concept === 'a') return <AProduct />;
  if (concept === 'b') return <BProduct />;
  if (concept === 'c') return <CProduct />;
  notFound();
}

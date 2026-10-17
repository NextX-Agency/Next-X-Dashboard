import { notFound } from 'next/navigation';
import { AHome } from '@/preview/concept-a';
import { BHome } from '@/preview/concept-b';
import { CHome } from '@/preview/concept-c';

export default async function ConceptHome({
  params,
}: {
  params: Promise<{ concept: string }>;
}) {
  const { concept } = await params;
  if (concept === 'a') return <AHome />;
  if (concept === 'b') return <BHome />;
  if (concept === 'c') return <CHome />;
  notFound();
}

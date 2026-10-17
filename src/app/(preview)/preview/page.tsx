import Link from 'next/link';

const CONCEPTS = [
  ['a', 'A · Het Magazine', 'Editorial technology retail'],
  ['b', 'B · Spec', 'Industrial and technical'],
  ['c', 'C · Rustig', 'Refined modern commerce'],
] as const;

export default function PreviewIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 font-sans">
      <h1 className="text-3xl font-semibold">NextX design previews</h1>
      <p className="mt-2 text-neutral-600">
        Three directions, real catalogue content. Local only. Not the production site.
      </p>
      <ul className="mt-10 divide-y border-y">
        {CONCEPTS.map(([key, name, blurb]) => (
          <li key={key} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xl font-medium">{name}</p>
              <p className="text-neutral-600">{blurb}</p>
            </div>
            <p className="flex gap-4 text-sm font-medium underline underline-offset-4">
              <Link href={`/preview/${key}` as never}>Home</Link>
              <Link href={`/preview/${key}/product` as never}>Product</Link>
              <Link href={`/preview/${key}/dashboard` as never}>Dashboard</Link>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

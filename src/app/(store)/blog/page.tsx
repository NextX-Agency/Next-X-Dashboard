import { notFound } from 'next/navigation';

/**
 * There is no blog: nothing is written, stored or published for it. The route stays so an old link
 * from the previous website answers with the shop's own "not found" page, with a way back to the
 * catalogue, instead of an empty page that looks like content. Add the page back with the first article.
 */
export default function BlogPage(): never {
  notFound();
}

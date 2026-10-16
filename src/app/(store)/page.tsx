import { redirect } from 'next/navigation';

/**
 * NextX sells audio only, so the storefront entry is the audio shop. The
 * redirect in next.config.ts normally answers first; this covers any request
 * that reaches the route directly.
 */
export default function StorefrontEntryPage() {
  redirect('/audio');
}

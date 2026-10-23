import { notFound } from 'next/navigation';

/**
 * No customer comments are collected or stored, so there is nothing honest to show. The route answers
 * with the shop's "not found" page rather than an empty page that asks for reviews. Add the page back
 * when real, permitted customer comments exist.
 */
export default function TestimonialsPage(): never {
  notFound();
}

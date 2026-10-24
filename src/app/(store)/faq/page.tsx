import { MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { assortmentMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'How ordering works',
  description:
    'How an order works at NextX: cart, WhatsApp, price and stock confirmation, pickup, and what happens when an item sells out.',
  alternates: { canonical: '/faq' },
};

// The page reads live settings (the WhatsApp number), like the cart: a blocking route by design.
export const instant = false;

/**
 * Only things the shop itself does, as built: nothing about hours, delivery, payment or warranty,
 * because none of those are stored anywhere on the site. Each answer is checked against the cart.
 */
const ANSWERS: Array<{ question: string; answer: string }> = [
  {
    question: 'How do I order?',
    answer:
      'Add products to the cart, choose a pickup location and date, and press "Send order via WhatsApp". WhatsApp opens with your list already written out. Press send there.',
  },
  {
    question: 'When is my order final?',
    answer:
      'When NextX has confirmed price and stock on WhatsApp. Until then nothing is reserved. The website shows the price and stock it has at that moment.',
  },
  {
    question: 'Which currency are prices in?',
    answer:
      'Prices are shown in SRD. A product priced in US dollars shows the dollar amount next to the SRD price.',
  },
  {
    question: 'How does pickup work?',
    answer:
      'The cart asks for a pickup location and a preferred date. NextX confirms both in its reply.',
  },
  {
    question: 'What if something sells out?',
    answer:
      'The cart checks stock whenever it is open. A sold-out item is marked, and the order cannot be sent until you remove it or lower the quantity.',
  },
  {
    question: 'Is my cart saved?',
    answer:
      'Yes, on the device and browser you used, until you empty it. It does not follow you to another phone.',
  },
];

export default async function FaqPage() {
  const settings = await getSettings();
  const businessName = settings?.businessName ?? 'NextX';
  const contact = whatsappLink(settings?.whatsapp, assortmentMessage(businessName));

  return (
    <article className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-8 sm:pt-10 sm:pb-20 lg:px-8 lg:pt-14 lg:pb-28">
      <div className="grid gap-6 sm:gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <header>
          <p className="nx-label text-ink-3">Ordering</p>
          <h1 className="nx-display mt-3 text-[clamp(30px,5vw,64px)] text-ink">
            How an order works
          </h1>
          <p className="mt-5 max-w-[40ch] text-[16px] text-ink-2 leading-relaxed">
            There is no checkout page. You send the order to NextX on WhatsApp and NextX
            confirms it.
          </p>
        </header>

        <div>
          <ol className="divide-y divide-line border-line border-y">
            {ANSWERS.map(({ question, answer }, index) => (
              <li
                key={question}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:py-6"
              >
                <span aria-hidden="true" className="tabular pt-0.5 font-semibold text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="nx-display text-[20px] text-ink">{question}</h2>
                  <p className="mt-2 max-w-[56ch] text-[15px] text-ink-2 leading-relaxed">
                    {answer}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
            <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
              Go to the shop
            </Link>
            {contact ? (
              <a
                href={contact}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-line"
              >
                <MessageCircle aria-hidden="true" />
                Ask a question on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

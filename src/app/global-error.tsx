'use client';

/**
 * The last resort: a throw inside the root layout itself.
 *
 * This is the only boundary that replaces `<html>` and `<body>` entirely, so a throw here means the
 * theme and font providers in `src/app/layout.tsx` never ran and this cannot lean on either. It is
 * plain and inline-styled on purpose: its one job is to render something legible when everything above
 * it has failed. It is customer-facing (the shop shares the root layout), so it says nothing about
 * the staff dashboard and nothing from the error beyond an opaque reference.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const button = {
    height: 44,
    padding: '0 20px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  } as const;

  return (
    <html lang="en-SR">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#131211',
          color: '#f4f1ec',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main style={{ width: '100%', maxWidth: 420 }}>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>
            Next<span style={{ color: '#ee5b0d' }}>X</span>
          </p>
          <h1 style={{ margin: '32px 0 0', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
            This page did not load.
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#c9c3ba' }}>
            Try once more. If it fails again, tell NextX
            {error.digest ? ` and quote reference ${error.digest}` : ''}.
          </p>
          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                ...button,
                border: '1px solid #ee5b0d',
                background: '#ee5b0d',
                color: '#131211',
              }}
            >
              Try again
            </button>
            <a
              href="/shop"
              style={{
                ...button,
                border: '1px solid #6b665e',
                background: 'transparent',
                color: '#f4f1ec',
              }}
            >
              Go to the shop
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

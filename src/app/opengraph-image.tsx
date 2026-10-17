import { ImageResponse } from 'next/og';

export const alt = 'NextX: shop online, bestel via WhatsApp';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Root-scoped, sharing `app/icon.tsx`'s reasoning: placing this file inside
 * `(store)/` empirically failed to register as a route under this project's
 * dev server. Every real share of this domain is a WhatsApp link to `/` or a
 * product, so a broken or default link preview there is a real loss.
 *
 * Neutral on purpose: the brand is NextX, not one product family. Colours are
 * the storefront's charcoal and orange (`styles/tokens.css`) as literal hex,
 * because the image renderer cannot read CSS variables.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 88px',
        background: '#131211',
        color: '#f4f1ec',
        borderTop: '10px solid #ee5b0d',
      }}
    >
      <div style={{ display: 'flex', fontSize: 120, fontWeight: 900, letterSpacing: -5 }}>
        <span>Next</span>
        <span style={{ color: '#ee5b0d' }}>X</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, letterSpacing: -2 }}>
          Shop online, bestel via WhatsApp.
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#b7b0a6' }}>
          Prijzen in SRD · Suriname
        </div>
      </div>
    </div>,
    { ...size },
  );
}

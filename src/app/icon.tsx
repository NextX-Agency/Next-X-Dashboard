import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Root-scoped so both the dashboard and storefront tabs get a real icon
 * instead of the browser default — there was none at all before this.
 * Colours are NextX charcoal and the logo orange (`styles/tokens.css`)
 * copied as literal hex: Satori (the renderer behind `ImageResponse`)
 * can't read live CSS custom properties, so these must be kept in sync by
 * hand if that palette ever changes.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141414',
        borderRadius: 7,
      }}
    >
      <div
        style={{
          display: 'flex',
          color: '#e8590c',
          fontSize: 25,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        X
      </div>
    </div>,
    { ...size },
  );
}

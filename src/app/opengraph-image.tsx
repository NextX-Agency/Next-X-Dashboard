import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'NextX: in-ear monitors and accessories, Paramaribo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Root-scoped, sharing `app/icon.tsx`'s reasoning: placing this file inside
 * `(store)/` empirically failed to register as a route under this project's
 * dev server. Every real share of this domain is a WhatsApp link to `/` or a
 * product, so a broken or default link preview there is a real loss.
 *
 * The NextX logo and one line: what the shop sells and where. The image
 * renderer has one regular-weight font and cannot read CSS variables, so the
 * logo is the real artwork (`public/nextx-logo-light.png`), with a plain
 * wordmark only if that file cannot be read.
 */
async function logoDataUri(): Promise<string | null> {
  try {
    const file = await readFile(join(process.cwd(), 'public', 'nextx-logo-light.png'));
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  const logo = await logoDataUri();

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
        background: '#ffffff',
        color: '#141414',
        borderBottom: '14px solid #e8590c',
      }}
    >
      {logo ? (
        // biome-ignore lint/performance/noImgElement: the OG renderer takes a plain img, not next/image
        // biome-ignore lint/a11y/useAltText: decorative inside a generated image; the route sets `alt`
        <img src={logo} width={720} height={286} />
      ) : (
        <div style={{ display: 'flex', fontSize: 160, letterSpacing: -6 }}>
          <span>Next</span>
          <span style={{ color: '#e8590c' }}>X</span>
        </div>
      )}
      <div style={{ display: 'flex', fontSize: 44, color: '#3f3f3b' }}>
        In-ear monitors and accessories. Paramaribo.
      </div>
    </div>,
    { ...size },
  );
}

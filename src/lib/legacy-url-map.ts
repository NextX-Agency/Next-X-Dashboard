/**
 * Exact legacy shop-nextx.com product URLs, from the 16 Oct 2026 inventory
 * (docs/audits/2026-10-16-seo-and-url-inventory.md). Slugs are deterministic:
 * slugify(name) + first 6 hex chars of SHA-256(legacy id), so this table does
 * not depend on any import run.
 */

/** Legacy audio product id -> new /audio/<slug>. */
export const LEGACY_AUDIO_REDIRECTS: ReadonlyArray<readonly [id: string, slug: string]> = [
  ['30594bb0-b4f2-4316-b877-ffc7102fe1fd', 'essager-1m-aux-3-5mm-to-aux-verlengkabel-b44bbf'],
  ['2bd236a5-7d5a-4d03-8f1a-7d165f5111a5', 'essager-2m-aux-3-5mm-to-aux-verlengkabel-bffa90'],
  ['e9f079f3-64d4-4fe0-b0f5-5b92700b4ec2', 'essager-aux-3-5mm-to-type-c-dac-d51556'],
  ['3f794fb4-b718-4fb0-af2f-54facfb11d95', 'kz-as16-pro-x-7596d0'],
  ['e8287ef5-e09c-4f76-864d-8b008829e750', 'kz-az09-17624f'],
  ['fe4e7b56-0858-469f-ba95-2e402b6acf03', 'kz-carol-9dcfe0'],
  ['388c31fc-d118-4ab3-ad9f-62303f69e878', 'kz-castor-pro-f99aaa'],
  ['77d9aedd-8f45-47cc-928c-e2ecee3ee888', 'kz-edx-pro-978ae9'],
  ['ce6a6431-14c9-4208-b5e7-bc5a97ecd075', 'kz-edx-pro-x-222f79'],
  ['61b007df-3edd-4b12-b13b-3687198fcc27', 'kz-elliptical-pouch-044c81'],
  ['c6e72547-4632-49b0-ba78-ee9774349757', 'kz-iem-3-5mm-kabel-f24447'],
  ['796c32f2-1e79-4826-b653-aa9ee24f0d66', 'kz-vader-4dc769'],
  ['e891d5e1-de3f-4321-9782-36523bc5a84f', 'kz-zs10-pro-x-730ef8'],
  ['af49afda-56e8-4b25-823a-fc91f9e7949f', 'kz-zsn-pro-2-fb2ce6'],
  ['226efd8e-0a24-4709-85dd-655fbccc0866', 'm-vave-sws12-wireless-iem-system-0d912b'],
];

/** Legacy ids of watch products that are retired for good: answered with 410. */
export const LEGACY_RETIRED_WATCH_IDS: readonly string[] = [
  '09d09c3b-9460-41cf-b68f-01bf4ad943e7',
  '19b6c76e-be33-4742-b811-f805c4df115e',
  '19b801e9-6577-4f63-a909-118461ba286b',
  '2144604f-a04f-4e1c-a921-3ad0cb9c0d5c',
  '22a5e50f-6d92-4423-89a9-750706ce913a',
  '2ab3bb62-88e1-4177-a8a5-c7d5447d2f69',
  '2e448d38-3d23-48c8-9056-9e0aa693d44f',
  '3df15549-6df6-4823-bc27-fe05377c7d06',
  '479772f5-7728-4e87-94fb-47410c519342',
  '50bd7ae3-d741-4df7-a985-48196a312e59',
  '5104531b-c2b1-4ad3-a2ac-cae3543f8fc4',
  '58b02e44-e70d-4f42-b039-81c2434e008e',
  '5a1aa52c-0557-40ad-aee4-cdfcd5822608',
  '623672c7-3927-4857-b829-ae3897349832',
  'aa28df06-2b2e-4a0e-b5a0-aafd8dddf2f6',
  'adaf0cc2-2b69-443b-9eec-bc25ce885976',
  'cee46e9c-a2f4-41bc-97cf-d59c7236fff0',
  'db29636d-cf62-4fae-b05c-21a742198bc2',
  'e475d0c9-ed60-47f9-96b5-00b68117e733',
];

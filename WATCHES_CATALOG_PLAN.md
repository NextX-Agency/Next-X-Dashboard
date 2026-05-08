# NextX — Watches Catalog & Dashboard Renovation Plan

> **Auteur**: Architectuurplan voor het toevoegen van een luxury watches storefront en het renoveren van het dashboard  
> **Datum**: 04 mei 2026  
> **Status**: Planning fase — ter review  
> **Data-veiligheid**: ⚠️ Alle database migraties zijn ADDITIEF — geen bestaande data wordt verwijderd of overschreven

---

## 1. Executive Summary

Dit plan beschrijft de volledige uitbreiding van het NextX platform met:

1. **`/`** — Een "Two Worlds" brand portal als nieuwe index pagina
2. **`/watches`** — Een zelfstandige luxury watches catalogus met eigen design identiteit
3. **`/audio`** — De bestaande audio catalogus verplaatst van `/catalog` naar `/audio`
4. **CMS verwijdering** — De ongebruikte CMS Hub sectie uit de sidebar verwijderen
5. **Dashboard integratie** — Beide catalogi naadloos beheerbaar vanuit één dashboard

Het platform blijft één codebase, één database, één admin dashboard. De scheiding zit volledig op de **frontend presentatielaag** — zelfde data-infrastructuur, verschillende UI identiteiten.

---

## 2. Huidige Staat (Audit Samenvatting)

### Tech Stack
- Next.js 16 + React 19 (App Router) — TypeScript strict
- Tailwind CSS 4 + custom design system (CSS variables)
- Prisma ORM + PostgreSQL via Supabase
- Vercel deployment (edge-optimized)

### Bestaande Routing
```
/catalog          → Audio catalogus (huidig)
/catalog/[id]     → Audio product detail
/cms              → CMS Hub dashboard (ongebruikt)
/cms/blog         → Blog beheer
/cms/banners      → Banner beheer
/cms/collections  → Collections beheer
/cms/pages        → Pagina beheer
/cms/testimonials → Testimonials beheer
/cms/faq          → FAQ beheer
/dashboard        → Admin dashboard
/items            → Product beheer
/stock, /sales, etc. → Overige admin pages
```

### Database Modellen (relevant)
- `Item` — Producten (audio, wordt uitgebreid naar watches)
- `Category` — Categorieën (gedeeld)
- `ItemImage` — Product afbeeldingen
- `ItemFeature` — Product specificaties (flexibel key-value)
- `Collection` — Curated productgroepen
- `Stock` — Voorraad per locatie
- `Banner` — Homepage banners

### Design System (huidig — audio)
- Primary: Orange `#f97015`
- Background: Dark navy `#141c2e`
- Accent: Orange
- Fonts: System font stack

---

## 3. Doelstellingen & Requirements

### Functioneel
- [x] Audio catalogus bereikbaar op `shop-nextx.com/audio`
- [x] Watches catalogus bereikbaar op `shop-nextx.com/watches`
- [x] Backwards compatibility: `/catalog` redirect naar `/audio`
- [x] Beide catalogi beheerbaar vanuit hetzelfde admin dashboard
- [x] CMS Hub verwijderd uit sidebar navigatie
- [x] Items filtreerbaar per catalogus type in admin

### Design (Watches)
- [x] Luxury, high-end esthetiek — denk AP, Patek Philippe, IWC
- [x] **Non-vibe-coded** — handcrafted design, editorial, niet generiek
- [x] Serif typografie voor headings (Cormorant Garamond)
- [x] Kleurpalet: near-black, warm goud, ivoor/crème
- [x] Grote, fotografisch gedreven product cards
- [x] Minimale, curated navigatie
- [x] Full-bleed hero met editorial layout

### Data Veiligheid
- [x] GEEN destructieve database operaties
- [x] Alle migraties zijn additive (nieuwe kolommen, geen drops)
- [x] Bestaande audio items behouden alle data
- [x] Nieuwe `catalogType` kolom standaard "audio" voor bestaande items
- [x] Rollback strategie beschikbaar voor elke fase

---

## 4. Architecturale Beslissingen

### 4.1 Data Scheiding: catalogType Kolom

**Beslissing**: Voeg een `catalogType` enum toe aan `Item` en `Category`.

```prisma
enum CatalogType {
  audio
  watches
}

model Item {
  // ... bestaande velden
  catalogType  CatalogType  @default(audio)
}

model Category {
  // ... bestaande velden
  catalogType  CatalogType  @default(audio)
}
```

**Waarom deze aanpak?**
- Minste disruptie aan bestaande code
- Bestaande items krijgen automatisch `audio` via de default
- Eenvoudig filtreerbaar in alle queries
- Geen nieuwe join tabellen nodig
- Toekomstbestendig (kan later `accessories`, `apparel` etc. worden)

**Migratie SQL (veilig, additief)**:
```sql
-- Fase 1: Voeg enum en kolom toe
ALTER TYPE "CatalogType" ADD VALUE IF NOT EXISTS 'audio';
ALTER TYPE "CatalogType" ADD VALUE IF NOT EXISTS 'watches';

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "catalogType" TEXT DEFAULT 'audio';
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "catalogType" TEXT DEFAULT 'audio';

-- Verificatie: check bestaande data is intact
SELECT COUNT(*) FROM "Item" WHERE "catalogType" = 'audio';
-- Verwacht: alle bestaande items
```

### 4.2 Routing Architectuur

```
Publiek:
  /audio              → Nieuwe audio catalogus route
  /audio/[id]         → Audio product detail
  /watches            → Nieuwe watches catalogus
  /watches/[id]       → Watch detail pagina
  /catalog            → Redirect (301) naar /audio

Admin (geen wijzigingen aan routes):
  /items              → Items beheer (met catalogType filter UI)
  /dashboard          → Ongewijzigd
  /stock, /sales, etc. → Ongewijzigd
```

### 4.3 Component Architectuur

```
src/components/
├── catalog/          → Bestaande audio componenten (ongewijzigd)
├── watches/          → Nieuwe watches componenten
│   ├── WatchesHeader.tsx
│   ├── WatchesHero.tsx
│   ├── WatchesCategoryNav.tsx
│   ├── WatchProductCard.tsx
│   ├── WatchQuickViewModal.tsx
│   ├── WatchCartDrawer.tsx
│   ├── WatchesFooter.tsx
│   └── index.ts
```

### 4.4 Design Systeem Scheiding

Twee parallelle design tokens — audio gebruikt bestaande globals.css, watches krijgt eigen CSS scope:

```css
/* Watches design scope — geen conflict met audio */
.watches-scope {
  --w-bg:           #0A0A0B;
  --w-surface:      #111114;
  --w-surface-2:    #18181C;
  --w-gold:         #C9A84C;
  --w-gold-light:   #E8C97A;
  --w-gold-muted:   #8A7040;
  --w-cream:        #F0EBE1;
  --w-cream-muted:  #B8B0A0;
  --w-text:         #EFEFEF;
  --w-muted:        #6B6B70;
  --w-border:       #2A2A2E;
  --w-border-light: #3A3A40;
}
```

---

## 5. Fase-per-Fase Implementatieplan

---

### FASE 0 — Voorbereiding & Setup (Dag 1)

> **Doel**: Codebase gereed maken, geen wijzigingen aan productie

#### 0.1 Branch Aanmaken
```bash
git checkout -b feature/watches-catalog
```

#### 0.2 Typografie Dependencies Toevoegen
```bash
pnpm add @next/font
```

Voeg Google Font toe in `src/app/layout.tsx` of in watches-specifieke layout:
- **Cormorant Garamond** (Thin 300, Light 300, Regular 400, Italic 400, Medium 500, SemiBold 600) — voor luxury headings
- **Jost** of **DM Sans** — voor body text watches (cleaner dan system font)

#### 0.3 Unsplash Image Planning
Verzamel high-quality watch images van Unsplash voor:
- Hero banner (full-bleed, 2560×1440, dark/moody watches foto)
- Category backgrounds (3-4 categorieën: Dress Watches, Sport Watches, Chronographs, etc.)
- Placeholder product images (voor development)

Aanbevolen Unsplash queries:
- "luxury watch dark background"
- "swiss watch editorial"
- "watch collection flat lay"
- "timepiece close up"

#### 0.4 Audit Bestaande Catalog Code
Lees door en documenteer alle imports/dependencies in:
- `src/app/catalog/page.tsx`
- `src/app/catalog/CatalogPageClient.tsx`
- `src/app/catalog/[id]/page.tsx`
- `src/services/catalog/getCatalogPageData.ts`
- `src/app/api/catalog/route.ts`

---

### FASE 1 — Brand Portal: De Index Pagina (Dag 1-2, ~1 dag)

> **Doel**: `shop-nextx.com` heeft een waardige homepage die de NextX brand identiteit communiceert en gebruikers naar de juiste catalogus stuurt  
> **Huidige staat**: `/` rendert direct de audio catalog (`import CatalogPage from './catalog/page'`) — dit werkt niet meer met twee aparte catalogi  
> **Impact**: Nieuwe pagina, geen bestaande code geraakt  
> **Risico**: Geen

#### Het Concept: "Two Worlds" Split-Screen Portal

Wanneer iemand `shop-nextx.com` intypt, zien ze een full-viewport split-screen:

```
┌──────────────────┬──────────────────┐
│                  │                  │
│   [dark navy]    │  [near-black]    │
│                  │                  │
│   audiofoto      │   watch foto     │  ← full-bleed per helft
│   (unsplash)     │   (unsplash)     │
│                  │                  │
│  NEXTX    [logo] │   [logo]  NEXTX  │  ← logo centreert
│  AUDIO    ─────────────── WATCHES  │
│                  │                  │
│  [Explore Audio] │ [Explore Watches]│
│                  │                  │
└──────────────────┴──────────────────┘
```

**Interactie**:
- Standaard: 50/50 split, beide helften gelijkwaardig
- Hover links: Expandeert naar 65/35, rechts krimpt subtiel weg
- Hover rechts: Expandeert naar 35/65, links krimpt weg
- Transitie: `600ms cubic-bezier(0.25, 0.1, 0.25, 1)` — soepel en zwaar
- Klik: Navigeert naar `/audio` of `/watches`

**Mobile** (< 768px): Twee volledige kaarten gestacked, elk ~50vh hoog.

#### 1.1 Route Setup

**Bestand**: `src/app/page.tsx`

Vervang de huidige redirect door de nieuwe BrandPortal component:

```typescript
// Verwijder: import CatalogPage from './catalog/page'
// Vervang door:
import BrandPortal from '@/components/BrandPortal'

export default function HomePage() {
  return <BrandPortal />
}
```

Geen `force-dynamic` nodig — de landing page is statisch, geen data fetch.

#### 1.2 BrandPortal Component

**Nieuw bestand**: `src/components/BrandPortal.tsx`

**Structuur** (client component voor hover interactie):

```tsx
'use client'

// State: hovered = null | 'audio' | 'watches'
// Transition: CSS width animatie op de twee helften

<div className="brand-portal"> {/* full viewport, flex row */}
  
  {/* Audio helft */}
  <a href="/audio" className={`portal-half portal-audio ${hovered}`}>
    <Image src="[unsplash audio]" fill objectFit="cover" />
    <div className="portal-overlay" /> {/* donkere gradient */}
    <div className="portal-content">
      <span className="portal-eyebrow">NextX</span>
      <h2 className="portal-title">Audio</h2>
      <p className="portal-sub">Premium In-Ear Monitors & Audiophile Gear</p>
      <span className="portal-cta">Explore Collection →</span>
    </div>
  </a>

  {/* Centrale divider met logo */}
  <div className="portal-center">
    <Image src="/nextx-logo-light.png" width={48} height={48} />
  </div>

  {/* Watches helft */}
  <a href="/watches" className={`portal-half portal-watches ${hovered}`}>
    <Image src="[unsplash watches]" fill objectFit="cover" />
    <div className="portal-overlay" />
    <div className="portal-content">
      <span className="portal-eyebrow">NextX</span>
      <h2 className="portal-title">Watches</h2>
      <p className="portal-sub">Curated Luxury Timepieces</p>
      <span className="portal-cta">Explore Collection →</span>
    </div>
  </a>

</div>
```

#### 1.3 CSS Stijlen

**Append aan**: `src/app/globals.css`

```css
/* ============================================
   BRAND PORTAL — Index pagina split-screen
   ============================================ */

.brand-portal {
  display: flex;
  height: 100svh;
  overflow: hidden;
  position: relative;
}

.portal-half {
  position: relative;
  flex: 1;
  transition: flex 0.6s cubic-bezier(0.25, 0.1, 0.25, 1);
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
}

/* Audio expandeert wanneer die gehoverd wordt */
.brand-portal:has(.portal-audio:hover) .portal-audio { flex: 1.4; }
.brand-portal:has(.portal-audio:hover) .portal-watches { flex: 0.6; }

/* Watches expandeert wanneer die gehoverd wordt */
.brand-portal:has(.portal-watches:hover) .portal-watches { flex: 1.4; }
.brand-portal:has(.portal-watches:hover) .portal-audio { flex: 0.6; }

/* Audio: navy-to-transparent overlay, oranje accent */
.portal-audio .portal-overlay {
  background: linear-gradient(
    to right,
    rgba(10, 16, 30, 0.85) 0%,
    rgba(10, 16, 30, 0.4) 100%
  );
}

.portal-audio .portal-title { color: #f97015; } /* NextX Orange */
.portal-audio .portal-eyebrow,
.portal-audio .portal-sub,
.portal-audio .portal-cta { color: rgba(255,255,255,0.85); }

/* Watches: black-to-transparent overlay, goud accent */
.portal-watches .portal-overlay {
  background: linear-gradient(
    to left,
    rgba(9, 9, 11, 0.85) 0%,
    rgba(9, 9, 11, 0.4) 100%
  );
}

.portal-watches .portal-title { color: #C9A84C; } /* NextX Gold */
.portal-watches .portal-eyebrow,
.portal-watches .portal-sub,
.portal-watches .portal-cta { color: rgba(240, 235, 225, 0.85); }

/* Content positionering */
.portal-content {
  position: absolute;
  bottom: 15%;
  padding: 0 2.5rem;
  z-index: 10;
}

.portal-audio .portal-content { left: 0; text-align: left; }
.portal-watches .portal-content { right: 0; text-align: right; }

.portal-eyebrow {
  display: block;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.portal-title {
  font-size: clamp(3rem, 5vw, 5.5rem);
  font-weight: 300;
  line-height: 1;
  margin-bottom: 0.75rem;
}

.portal-audio .portal-title {
  font-family: system-ui, sans-serif; /* Audio: modern sans */
}

.portal-watches .portal-title {
  font-family: var(--font-cormorant, Georgia), serif; /* Watches: serif */
}

.portal-sub {
  font-size: 0.875rem;
  font-weight: 300;
  opacity: 0.7;
  margin-bottom: 1.5rem;
  max-width: 22ch;
}

.portal-audio .portal-sub { margin-left: 0; }
.portal-watches .portal-sub { margin-left: auto; }

.portal-cta {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-bottom: 1px solid currentColor;
  padding-bottom: 2px;
  transition: opacity 0.3s;
}

.portal-half:hover .portal-cta { opacity: 1; }
.portal-cta { opacity: 0.6; }

/* Centrale divider & logo */
.portal-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  pointer-events: none;
  transition: opacity 0.4s;
}

/* Logo container: cirkel met blur backdrop */
.portal-center-inner {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Verticale scheidingslijn */
.portal-divider {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255,255,255,0.1);
  z-index: 15;
  pointer-events: none;
}

/* Mobile: stacked verticaal */
@media (max-width: 767px) {
  .brand-portal { flex-direction: column; }
  .portal-half { flex: 1 !important; } /* override hover expand */
  .portal-divider { display: none; }
  .portal-center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .portal-audio .portal-content,
  .portal-watches .portal-content {
    left: 0; right: 0; text-align: center;
    padding: 0 1.5rem;
  }
  .portal-watches .portal-sub { margin: 0 auto; }
  .portal-title { font-size: clamp(2.5rem, 10vw, 4rem); }
}
```

#### 1.4 Afbeeldingen Kiezen (Unsplash)

**Audio helft**: Donkere, moody foto van audiophile setup of close-up van IEM. Zoek op:
- `"in-ear monitor dark background"`
- `"audiophile headphones editorial"`
- `"earphones dark moody"`

**Watches helft**: Luxury watch close-up, bokeh achtergrond, dramatisch licht. Zoek op:
- `"luxury watch dark editorial"`
- `"watch face close up dark"`
- `"swiss timepiece studio"`

**Implementatie**: Download op 2560px breed, zet in `/public/portal-audio.jpg` en `/public/portal-watches.jpg`. Next.js comprimeert automatisch naar WebP.

#### 1.5 Metadata

```typescript
export const metadata: Metadata = {
  title: 'NextX — Premium Audio & Luxury Watches | Suriname',
  description: 'NextX biedt premium audiophile gear en curated luxury timepieces in Suriname.',
  openGraph: {
    title: 'NextX',
    images: [{ url: '/og-image.png' }],
  },
};
```

---

### FASE 2 — CMS Verwijdering uit Sidebar (Dag 2, ~2 uur)

> **Doel**: CMS Hub sectie verwijderen uit de sidebar navigatie  
> **Impact**: Alleen visueel — geen routes worden verwijderd, code blijft intact  
> **Risico**: Laag

#### 1.1 Sidebar Wijziging

**Bestand**: `src/components/Sidebar.tsx`

Verwijder de "Content" sectie uit de sidebar navigatie array. Dit zijn de entries:
- CMS Hub → `/cms`
- Blog → `/cms/blog`
- Banners → `/cms/banners`
- Collections → `/cms/collections`
- Pages → `/cms/pages`
- Testimonials → `/cms/testimonials`
- FAQ → `/cms/faq`

**Aanpak**: Commentaar uitschrijven of sectie volledig verwijderen uit de `navSections` array.

#### 1.2 BottomNav Wijziging

**Bestand**: `src/components/BottomNav.tsx`

Verwijder eventuele CMS-gerelateerde items uit de mobile bottom navigation.

#### 1.3 Routes Verificatie

**Bestand**: `src/lib/routes.ts`

De `/cms/*` routes blijven beschermde admin routes (geen wijziging nodig). Ze zijn gewoon niet meer zichtbaar in de navigatie. Direct navigeren naar `/cms` werkt nog steeds voor eventuele toekomstige activatie.

#### 1.4 Dashboard Quick Links

**Bestand**: `src/app/dashboard/page.tsx`

Verwijder eventuele quick-action cards die verwijzen naar `/cms`.

---

### FASE 3 — Audio Catalogus naar `/audio` (Dag 3, ~4 uur)

> **Doel**: Bestaande `/catalog` kopiëren naar `/audio`  
> **Impact**: Publieke routes wijzigen — SEO redirect nodig  
> **Risico**: Laag (redirect vangt bestaande links)

#### 2.1 Directory Structuur Opzetten

```bash
# Kopieer catalog directory naar audio
cp -r src/app/catalog src/app/audio
```

#### 2.2 Interne Links Updaten

In alle gekopieerde audio bestanden:
- Verander referenties van `/catalog` naar `/audio`
- Verander referenties van `/catalog/[id]` naar `/audio/[id]`

**Bestanden om te updaten**:
- `src/app/audio/page.tsx` — layout import, canonical URL
- `src/app/audio/[id]/page.tsx` — breadcrumb links, canonical
- `src/app/audio/CatalogPageClient.tsx` — eventuele hardcoded routes
- `src/components/catalog/NewHeader.tsx` — logo href
- `src/components/catalog/NewFooter.tsx` — navigatie links

#### 2.3 Redirect van `/catalog` naar `/audio`

**Bestand**: `next.config.ts`

```typescript
async redirects() {
  return [
    {
      source: '/catalog',
      destination: '/audio',
      permanent: true, // 301 redirect — goed voor SEO
    },
    {
      source: '/catalog/:id',
      destination: '/audio/:id',
      permanent: true,
    },
  ];
}
```

#### 2.4 API Route Aanpassing

De bestaande `/api/catalog` route blijft intact. De audio pages gebruiken dezelfde API maar filteren op `catalogType: 'audio'` (na database migratie in Fase 3).

Tijdelijk: Audio pages werken zonder filter totdat database migratie gedaan is.

#### 2.5 SEO Metadata Update

**Bestand**: `src/app/audio/layout.tsx`

Update canonical URLs en metadata:
```typescript
export const metadata: Metadata = {
  title: 'NextX Audio — Premium In-Ear Monitors & Audiophile Gear',
  alternates: {
    canonical: 'https://shop-nextx.com/audio',
  },
};
```

#### 2.6 Header/Sidebar Links

Update alle internal links die naar `/catalog` verwijzen:
- `src/components/Sidebar.tsx` — "View Catalog" link
- Eventuele homepage links

---

### FASE 4 — Database Migratie (Dag 3-4, ~2 uur + validatie)

> **Doel**: `catalogType` veld toevoegen aan Item en Category  
> **Impact**: Database schema wijziging  
> **Risico**: LAAG — puur additief, default waarde veilig

#### ⚠️ Data Veiligheid Protocol

VOOR elke database operatie:
1. **Backup maken** via `/api/backup` endpoint (al beschikbaar)
2. **Staging test** — run migratie eerst op lokale database
3. **Verificatie query** — tel items voor EN na migratie
4. **Rollback klaar** — het verwijderen van de kolom als rollback

#### 3.1 Prisma Schema Update

**Bestand**: `prisma/schema.prisma`

```prisma
// Voeg toe BOVEN de Item model definitie
enum CatalogType {
  audio
  watches
}

model Item {
  id           String       @id @default(cuid())
  // ... alle bestaande velden behouden ...
  catalogType  CatalogType  @default(audio)
  
  // ... rest van model ongewijzigd
}

model Category {
  id           String       @id @default(cuid())
  // ... alle bestaande velden behouden ...
  catalogType  CatalogType  @default(audio)
  
  // ... rest van model ongewijzigd
}
```

#### 3.2 Migratie Uitvoeren

```bash
# Genereer migratie (bekijk SQL voor uitvoering!)
npx prisma migrate dev --name "add_catalog_type_to_item_and_category" --create-only

# Review de gegenereerde SQL in prisma/migrations/
# Verifieer dat het alleen ADD COLUMN statements zijn

# Pas toe op database
npx prisma migrate deploy
```

**Verwachte gegenereerde SQL**:
```sql
-- CreateEnum
CREATE TYPE "CatalogType" AS ENUM ('audio', 'watches');

-- AlterTable (veilig — ADD COLUMN met DEFAULT)
ALTER TABLE "Item" ADD COLUMN "catalogType" "CatalogType" NOT NULL DEFAULT 'audio';
ALTER TABLE "Category" ADD COLUMN "catalogType" "CatalogType" NOT NULL DEFAULT 'audio';
```

#### 3.3 Post-Migratie Verificatie

Voer uit in Supabase SQL editor:
```sql
-- Controleer alle bestaande items hebben catalogType = 'audio'
SELECT catalogType, COUNT(*) FROM "Item" GROUP BY catalogType;
-- Verwacht: { audio: [alle bestaande items] }

SELECT catalogType, COUNT(*) FROM "Category" GROUP BY catalogType;
-- Verwacht: { audio: [alle bestaande categorieën] }

-- Spot-check een paar items
SELECT id, name, catalogType FROM "Item" LIMIT 10;
```

#### 3.4 Prisma Client Regenereren

```bash
npx prisma generate
```

#### 3.5 API Routes Updaten

**Bestand**: `src/app/api/catalog/route.ts`

Voeg filter toe aan queries op basis van een query parameter:
```typescript
// ?catalog=audio of ?catalog=watches
const catalogType = searchParams.get('catalog') ?? 'audio';

// In de Prisma query:
const items = await prisma.item.findMany({
  where: { 
    catalogType: catalogType as CatalogType,
    // ... bestaande where condities
  },
  // ... rest ongewijzigd
});
```

Maak een tweede API endpoint voor watches:
**Nieuw bestand**: `src/app/api/watches/route.ts` — kopie van catalog route maar met `catalogType: 'watches'`

---

### FASE 5 — Watches Catalogus Structuur (Dag 4-5)

> **Doel**: Route en service structuur opzetten voor watches  
> **Impact**: Nieuwe code, geen wijzigingen aan bestaand

#### 4.1 Directory Structuur Aanmaken

```
src/app/watches/
├── layout.tsx                  → Watches layout (luxury fonts, watches design scope)
├── page.tsx                    → Server-side data preload (ISR)
├── WatchesCatalogClient.tsx    → Client-side state (filters, cart, modals)
└── [id]/
    └── page.tsx                → Watch detail pagina
```

#### 4.2 Watches Layout

**Bestand**: `src/app/watches/layout.tsx`

```typescript
import { Cormorant_Garamond, Jost } from 'next/font/google';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
});

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-jost',
});

export default function WatchesLayout({ children }) {
  return (
    <div className={`watches-scope ${cormorant.variable} ${jost.variable}`}>
      {children}
    </div>
  );
}

export const metadata: Metadata = {
  title: 'NextX Watches — Luxury Timepieces',
  description: 'Discover our curated collection of luxury timepieces.',
  alternates: { canonical: 'https://shop-nextx.com/watches' },
};
```

#### 4.3 Server-side Data Service

**Bestand**: `src/services/watches/getWatchesCatalogData.ts`

Kopie van `getCatalogPageData.ts` met:
- `catalogType: 'watches'` filter in alle queries
- Watches-specifieke cache key: `watches-catalog-data`
- Eigen ISR revalidation interval

#### 4.4 Main Watches Page

**Bestand**: `src/app/watches/page.tsx`

Server component die:
1. `getWatchesCatalogData()` aanroept
2. Watches-specifieke metadata genereert
3. `WatchesCatalogClient` rendert met data als props

---

### FASE 6 — Watches Luxury Design Systeem (Dag 5-6)

> **Doel**: Volledige luxury design identity voor de watches catalogus  
> **Principe**: Editorial, considered, non-generic — zoals een echte luxury brand site

#### 5.1 CSS Design Tokens

**Bestand**: `src/app/globals.css` (append aan het einde)

```css
/* ============================================
   WATCHES CATALOG — Luxury Design System
   Scope: .watches-scope (prevents conflicts)
   ============================================ */

.watches-scope {
  /* Background Palette */
  --w-bg:           #09090B;    /* Near-absolute black */
  --w-surface:      #111113;    /* Card surfaces */
  --w-surface-2:    #18181C;    /* Elevated surfaces */
  --w-surface-3:    #222228;    /* Hover states */
  
  /* Gold Palette — Warm, not yellow */
  --w-gold:         #C9A84C;    /* Primary gold */
  --w-gold-light:   #E8C97A;    /* Highlights */
  --w-gold-muted:   #7A6428;    /* Subtle gold */
  --w-gold-glow:    rgba(201, 168, 76, 0.15);
  
  /* Text */
  --w-cream:        #F0EBE1;    /* Primary text */
  --w-cream-2:      #C8C0B4;    /* Secondary text */
  --w-muted:        #6B6B70;    /* Muted/placeholder */
  --w-white:        #FAFAFA;
  
  /* Borders */
  --w-border:       #2A2A2E;    /* Default border */
  --w-border-gold:  rgba(201, 168, 76, 0.25); /* Gold border */
  
  /* Typography */
  --font-display:   var(--font-cormorant), 'Georgia', serif;
  --font-body:      var(--font-jost), system-ui, sans-serif;
  
  /* Spacing — more generous than audio */
  --w-section-y:    6rem;       /* Vertical section padding */
  --w-container:    1440px;     /* Max content width */
  
  /* Transitions */
  --w-transition:   all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
  --w-transition-slow: all 0.7s cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

#### 5.2 Typography Scale

```css
.watches-scope {
  /* Display — used for hero titles, product names */
  .w-display-1 {
    font-family: var(--font-display);
    font-size: clamp(3rem, 6vw, 7rem);
    font-weight: 300;
    line-height: 0.95;
    letter-spacing: -0.02em;
  }
  
  /* Heading — section titles */
  .w-heading {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 3vw, 3rem);
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: 0.01em;
  }
  
  /* Subheading — category labels */
  .w-subheading {
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--w-gold);
  }
  
  /* Body */
  .w-body {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 300;
    line-height: 1.7;
    color: var(--w-cream-2);
  }
}
```

---

### FASE 7 — Watches Componenten Bouwen (Dag 6-9)

> **Doel**: Alle watches-specifieke UI componenten  
> **Kwaliteitsstandaard**: Elke component moet er uitzien zoals het door een senior product designer is gebouwd

#### 6.1 WatchesHeader Component

**Bestand**: `src/components/watches/WatchesHeader.tsx`

**Design Vision**:
- Vrijwel transparant, wordt solid near-black bij scroll
- Logo links: "NEXTX" in Cormorant Garamond spaced letters + "WATCHES" in kleine caps
- Navigatie midden: Collections, Brands, New Arrivals, About
- Rechts: Cart icon (goud) + zoekicoontje
- Gouden bottom border die verschijnt bij scroll
- Geen hamburger menu → slide-in overlay op mobile

```
Layout:
[NEXTX WATCHES]      [Collections  Brands  New]      [🔍 🛒(2)]
```

**Scroll behavior**: 
```css
.watches-header {
  position: fixed;
  background: transparent;
  transition: var(--w-transition);
  border-bottom: 1px solid transparent;
}

.watches-header.scrolled {
  background: rgba(9, 9, 11, 0.95);
  backdrop-filter: blur(20px);
  border-bottom-color: var(--w-border);
}
```

#### 6.2 WatchesHero Component

**Bestand**: `src/components/watches/WatchesHero.tsx`

**Design Vision**:
- Full viewport height (100svh)
- Full-bleed achtergrond afbeelding (Unsplash) of video
- Donkere overlay (gradient: left-to-right, 70% zwart naar transparant)
- Tekst links uitgelijnd, hoog gepositioneerd (not centered — editorial)
- Goldkleurige subheading (spaced uppercase: "NEW COLLECTION 2026")
- Grote serif titel in wit (Cormorant): "Timeless\nPrecision"
- Kleine body tekst: "Curated timepieces for those who value craftsmanship"
- CTA button: goud outline met hover fill, geen ronde hoeken
- Rechtsonder: kleine "scroll indicator" animatie

**Layering**:
```
[Full-bleed watch photo]
[Gradient overlay: black 70% → transparent]
[Content: left-aligned, 40% width, vertically centered slightly above center]
```

#### 6.3 WatchProductCard Component

**Bestand**: `src/components/watches/WatchProductCard.tsx`

**Design Vision** (fundamenteel anders dan audio cards):

```
┌─────────────────────────────┐
│                             │  ← Geen border radius boven
│    [WATCH PHOTOGRAPH]       │  ← Vierkant/portrait aspect ratio
│    (dark gradient bottom)   │  ← 1:1.2 ratio
│                             │
├─────────────────────────────┤
│  BRAND NAME                 │  ← spaced uppercase, gold, 10px
│  Model Name                 │  ← Cormorant 20px, cream
│                             │
│  Movement · Case Size       │  ← specs in kleine tekst, muted
│                             │
│  SRD 2.450  |  USD 65       │  ← prijs, right-align gold
└─────────────────────────────┘
```

**Hover state**:
- Subtiele gouden border verschijnt (1px, --w-border-gold)
- Afbeelding scale 1.03 (heel subtiel, geen 1.1 zoals goedkope sites)
- "View Details" tekst fade in boven foto (geen grote button)
- Geen drop shadows — luxury is flat met subtiele borders

**Grid**:
- Desktop: 3-kolom grid met inconsistente hoogte (masonry-stijl optioneel)
- Mobile: 2-kolom, geen masonry

#### 6.4 WatchesCategoryNav Component

**Bestand**: `src/components/watches/WatchesCategoryNav.tsx`

**Design Vision**:
- Horizontale scroll navigatie (niet sidebar)
- Pill-shaped filters MET goud accent op active
- Categories: All, Dress Watches, Sport Watches, Chronographs, Limited Edition
- Strak, geen overflow shadow trucjes — gewoon clean
- Mobile: horizontale scroll zonder scrollbar visible

#### 6.5 WatchQuickViewModal Component

**Bestand**: `src/components/watches/WatchQuickViewModal.tsx`

**Design Vision**:
- Slide-in van rechts (full-height panel, 560px breed)
- NIET een centered modal — een side panel
- Groot afbeeldingsgedeelte (60% van panel hoogte)
- Product info: naam, movement, case, prijs
- Specificaties tabel: clean key-value layout
- CTA: "Add to Cart" — goud, minimaal
- Close: X rechtsbovenin, subtiel

#### 6.6 WatchCartDrawer Component

**Bestand**: `src/components/watches/WatchCartDrawer.tsx`

**Design Vision**:
- Slide-in van rechts
- Donkere achtergrond (#111113)
- Items als minimalistische list (foto 64px, naam, prijs)
- Subtotaal met gouden kleur
- "Proceed to Checkout" knop: solid gold, full width
- Empty state: "Your cart is empty" in serif italic

#### 6.7 WatchesFooter Component

**Bestand**: `src/components/watches/WatchesFooter.tsx`

**Design Vision**:
- Donkere achtergrond (#111113)
- Gouden horizontale lijn boven footer
- Links: "NEXTX WATCHES" logo + tagline
- Midden: Quick links (2 kolommen)
- Rechts: Social + contact
- Helemaal onder: copyright + legal links in één regel
- GEEN grote footer met veel vulling — strak en elegant

---

### FASE 8 — Watches Detail Pagina (Dag 9-10)

> **Doel**: Luxury product detail pagina voor watches

#### 7.1 Route

**Bestand**: `src/app/watches/[id]/page.tsx`

#### 7.2 Layout Design

```
DESKTOP LAYOUT (2-kolom):
┌───────────────────────────────────┐
│ ← NEXTX WATCHES     Breadcrumb   │  ← Sticky header
├──────────────────┬────────────────┤
│                  │  BRAND NAME   │  ← gold spaced
│   [MAIN IMAGE]   │               │
│                  │  Model Name   │  ← Cormorant 36px
│   ──────────     │               │
│  [img][img][img] │  Movement     │  ← specs
│  Thumbnail row   │  Case: 40mm   │
│                  │  Water Resist │
│                  │               │
│                  │  SRD 2.450    │  ← groot, goud
│                  │  USD 65.00    │
│                  │               │
│                  │  [Add to Cart]│  ← gold button
│                  │  [Reserve]    │  ← outline button
├──────────────────┴────────────────┤
│  ABOUT THIS TIMEPIECE             │  ← Volledige beschrijving
│  (serif typography, ruim)         │
├───────────────────────────────────┤
│  SPECIFICATIONS                   │  ← Clean tabel layout
│  Movement  │  Automatic          │
│  Case      │  Stainless Steel    │
│  ...                              │
├───────────────────────────────────┤
│  YOU MAY ALSO LIKE                │  ← 3 gerelateerde watches
└───────────────────────────────────┘
```

---

### FASE 9 — Dashboard Integratie (Dag 10-11)

> **Doel**: Admin items beheer werkt naadloos voor beide catalogi

#### 8.1 Items Pagina Update

**Bestand**: `src/app/items/page.tsx`

Voeg toe:
- **Catalog filter tabs** boven de items tabel: `All | Audio | Watches`
- **"Add Item" dialog**: catalogType dropdown (Audio/Watches) als nieuw veld
- **Item cards**: toon catalogType badge

Wijzigingen zijn PUUR frontend — geen nieuwe routes of API endpoints.

#### 8.2 Sidebar Update

**Bestand**: `src/components/Sidebar.tsx`

Voeg toe onder "Store" sectie:
```
Storefronts
  ├── Audio Catalog    → /audio (opens in new tab)
  └── Watches Catalog  → /watches (opens in new tab)
```

En vervang de "View Catalog" link (die nu verwijst naar /catalog) door twee separate links.

#### 8.3 Dashboard Stats

**Bestand**: `src/app/dashboard/page.tsx`

Optioneel: Voeg catalog type breakdown toe aan bestaande stats cards:
- "Total Products" → split per catalog type
- Geen nieuwe UI nodig — kleine badge/indicator volstaat

#### 8.4 Stock Management

**Bestand**: `src/app/stock/page.tsx`

Voeg `catalogType` filter toe zodat admins stock per catalogus kunnen bekijken. Bestaande data onaangetast.

---

### FASE 10 — SEO & Performance (Dag 11-12)

#### 9.1 Watches SEO Metadata

**Bestand**: `src/app/watches/page.tsx`

```typescript
export const metadata: Metadata = {
  title: 'NextX Watches — Luxury Timepieces | Suriname',
  description: 'Discover our curated collection of luxury and premium watches. Authorized dealer in Suriname.',
  keywords: ['luxury watches', 'timepieces', 'Suriname', 'NextX'],
  openGraph: {
    title: 'NextX Watches',
    description: 'Curated luxury timepieces',
    images: [{ url: '/og-watches.jpg', width: 1200, height: 630 }],
  },
};
```

#### 9.2 JSON-LD Schema

Voeg watches-specifieke structured data toe:
```json
{
  "@type": "Store",
  "name": "NextX Watches",
  "description": "Luxury timepieces",
  "url": "https://shop-nextx.com/watches"
}
```

#### 9.3 Image Optimization

Voor watches afbeeldingen (Unsplash of product):
- Gebruik Next.js `<Image>` component altijd
- `priority` prop op bovenste afbeeldingen (LCP optimalisatie)
- Correcte `sizes` prop: `"(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"`
- WebP formaat automatisch via Next.js

#### 9.4 Performance Budget

Target metrics voor watches catalog:
- LCP < 2.5s
- CLS < 0.1
- FID < 100ms
- Lighthouse score > 90

---

### FASE 11 — Testing & Polish (Dag 12-13)

#### 11.1 Functionele Tests

- [ ] `/` — Brand Portal laadt correct (split-screen)
- [ ] `/` — Hover expand werkt op beide helften (desktop)
- [ ] `/` — Mobile stacked layout werkt correct
- [ ] `/` — Navigatie naar `/audio` en `/watches` werkt
- [ ] `/audio` laadt correct met alle audio items
- [ ] `/catalog` redirect (301) naar `/audio` werkt
- [ ] `/watches` laadt correct (leeg of met test watches items)
- [ ] Cart werkt op watches catalogus
- [ ] Detail pagina `/watches/[id]` laadt correct
- [ ] CMS niet meer zichtbaar in sidebar
- [ ] Dashboard items page: catalogType filter werkt
- [ ] Admin kan nieuwe watches item aanmaken

#### 10.2 Cross-Device Tests

- [ ] Desktop Chrome, Firefox, Safari
- [ ] Mobile iOS Safari (kritisch voor luxury doelgroep)
- [ ] Mobile Android Chrome
- [ ] Tablet landscape mode

#### 10.3 Design Review Checklist

- [ ] Watches design ziet er NIET gegenereerd uit
- [ ] Typography scale is consistent
- [ ] Gold accenten zijn subtiel, niet overdreven
- [ ] Witruimte is genereus
- [ ] Hover states zijn smooth (niet abrupt)
- [ ] Foto kwaliteit is hoog genoeg
- [ ] Mobile layout is niet gecompromitteerd

#### 10.4 Data Integriteit Verificatie

Na alle wijzigingen:
```sql
-- Alle audio items nog intact?
SELECT COUNT(*) FROM "Item" WHERE "catalogType" = 'audio';

-- Geen items verloren?
SELECT COUNT(*) FROM "Item";

-- Categories intact?
SELECT COUNT(*) FROM "Category";
```

---

## 6. Database Migratie Veiligheidsprotocol

### Principe: Never Destructive

**VERBODEN** operaties zonder expliciete goedkeuring:
- `DROP TABLE`
- `DROP COLUMN`
- `DELETE FROM` (zonder WHERE)
- `TRUNCATE`
- `ALTER TABLE ... DROP CONSTRAINT`

**TOEGESTAAN** (veilige operaties):
- `ADD COLUMN ... DEFAULT ...`
- `CREATE INDEX` (met CONCURRENTLY op productie)
- `CREATE TYPE ... IF NOT EXISTS`
- `ALTER TABLE ... ADD CONSTRAINT` (met VALIDATE = false eerst)

### Backup Strategie

1. **Voor migratie**: Trigger `/api/backup` endpoint
2. **Verificatie**: Dump tabel counts voor en na
3. **Rollback**: `ALTER TABLE "Item" DROP COLUMN IF EXISTS "catalogType";`

### Staging Eerst

Alle database wijzigingen worden eerst getest op:
1. Lokale PostgreSQL database
2. Supabase preview branch (indien beschikbaar)
3. Dan pas productie

---

## 7. Watches Design Referentie & Inspiratie

### Kleurpalet Breakdown

| Rol | Hex | Gebruik |
|-----|-----|---------|
| Background | `#09090B` | Pagina achtergrond |
| Surface | `#111113` | Cards, panels |
| Gold Primary | `#C9A84C` | CTAs, accenten, prijzen |
| Gold Light | `#E8C97A` | Hover states, highlights |
| Cream | `#F0EBE1` | Primaire tekst |
| Cream Muted | `#C8C0B4` | Secundaire tekst |
| Muted | `#6B6B70` | Placeholders, labels |
| Border | `#2A2A2E` | Subtiele borders |

### Typografie Hiërarchie

| Niveau | Font | Gebruik |
|--------|------|---------|
| Display | Cormorant Garamond 300 | Hero titels |
| Headline | Cormorant Garamond 400 | Product namen, section headers |
| Subhead | Jost 400, tracked, uppercase | Labels, kategorieën |
| Body | Jost 300 | Beschrijvingen, specs |
| Caption | Jost 400 | Prijs, badges |

### Design Principes

1. **Whitespace is content** — Meer ruimte = meer luxe. Geen pagina vol content proppen.
2. **Photography first** — Producten verdienen grote, kwalitatieve afbeeldingen
3. **Gold is accent, niet primary** — Gold als highlight, niet als dominant kleur
4. **Typography does the work** — Grote serif koppen, geen flashy animaties
5. **Subtle interactions** — Hover effecten zijn zacht en slow (0.4s min)
6. **No gradients** — Flat backgrounds, subtiele borders, geen rainbow gradients
7. **Editorial grid** — Niet altijd perfect symmetrisch, intentionele asymmetrie is luxury

### Inspiratie Referenties (design stijl — niet kopiëren)

- IWC Schaffhausen website — typography-first luxury
- A. Lange & Söhne — editorial photography
- Nomos Glashütte — clean, functional luxury
- Hodinkee — editorial watches journalism aesthetic

---

## 8. Tijdlijn Schatting

| Fase | Beschrijving | Geschatte Duur |
|------|-------------|----------------|
| Fase 0 | Voorbereiding, fonts, assets verzamelen | 0.5 dag |
| Fase 1 | **Brand Portal** — nieuwe index pagina `/` | 1 dag |
| Fase 2 | CMS verwijderen uit sidebar | 0.5 dag |
| Fase 3 | Audio naar `/audio` route + redirect | 0.5 dag |
| Fase 4 | Database migratie (+ validatie) | 1 dag |
| Fase 5 | Watches route structuur | 0.5 dag |
| Fase 6 | Design systeem (CSS tokens, typografie) | 0.5 dag |
| Fase 7 | Watches componenten (7 componenten) | 3 dagen |
| Fase 8 | Watches detail pagina | 1 dag |
| Fase 9 | Dashboard integratie | 1 dag |
| Fase 10 | SEO & Performance | 0.5 dag |
| Fase 11 | Testing & Polish | 1 dag |
| **Totaal** | | **~11 werkdagen** |

---

## 9. Risico Register

| Risico | Kans | Impact | Mitigatie |
|--------|------|--------|-----------|
| Database migratie breekt bestaande data | Laag | Hoog | Backup + additive only + verificatie queries |
| `/catalog` redirect breekt SEO | Laag | Medium | 301 redirect (permanent) preserveert link juice |
| Audio catalogus breekt na verplaatsing | Medium | Hoog | Test lokaal volledig voor deploy |
| Watches design ziet er generiek uit | Medium | Medium | Design review checklist + iteraties |
| Prisma type conflicts na schema update | Laag | Medium | `prisma generate` na elke schema wijziging |
| Performance regressie door nieuwe fonts | Laag | Low | font-display: swap + subsetting |

---

## 10. Bestanden Om Aan Te Raken

### Nieuwe Bestanden (veilig — additive)
- `src/components/BrandPortal.tsx` — Index split-screen portal
- `public/portal-audio.jpg` — Unsplash audio hero foto
- `public/portal-watches.jpg` — Unsplash watches hero foto
- `src/app/audio/**` — Kopie van catalog
- `src/app/watches/**` — Geheel nieuw
- `src/app/api/watches/route.ts` — Watches API
- `src/components/watches/**` — 7 nieuwe componenten
- `src/services/watches/getWatchesCatalogData.ts`
- `prisma/migrations/[timestamp]_add_catalog_type/migration.sql`

### Gewijzigde Bestanden (met voorzichtigheid)
- `src/app/page.tsx` — Vervangen door BrandPortal import
- `prisma/schema.prisma` — Additive wijziging
- `src/components/Sidebar.tsx` — CMS sectie verwijderen + storefronts links toevoegen
- `next.config.ts` — Redirects toevoegen (`/catalog` → `/audio`)
- `src/app/globals.css` — Brand Portal + Watches tokens appenden
- `src/app/items/page.tsx` — CatalogType filter UI
- `src/app/api/catalog/route.ts` — CatalogType filter param

### NIET aanraken
- Alle bestaande `/cms/**` routes (verborgen maar intact)
- Supabase database bestaande data
- Alle `/api/auth/**` routes
- Alle financial/admin routes
- `src/lib/AuthContext.tsx`
- `src/lib/routes.ts` (tenzij nodig voor watches routes)

---

## 11. Post-Launch Overwegingen

### Content Strategie
- Watches items aanmaken in het systeem via `/items` pagina
- ItemFeature gebruiken voor watch specs (Movement, Case, Water Resistance, etc.)
- Kwalitatieve product foto's uploaden via bestaande upload functionaliteit
- Watches-specifieke banners aanmaken via `/cms/banners` (CMS blijft functioneel, alleen niet in sidebar)

### Toekomstige Uitbreidingen (buiten scope dit plan)
- Watch-specifieke filterlogica (movement type, case size range)
- Watchlist/Wishlist functionaliteit
- Pre-order systeem voor limited editions
- Watch service/onderhoud pagina
- Brand pagina's (per merk)

---

*Plan opgesteld na volledige code audit van het NextX Dashboard project.*  
*Alle beschreven wijzigingen zijn ontworpen om de bestaande audio catalogus en live data volledig intact te houden.*

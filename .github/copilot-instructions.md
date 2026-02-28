# GitHub Copilot Instructions — NextX Dashboard

## Build Requirement

**After every code change, run the build and fix all errors before considering the task done.**

```bash
pnpm build
```

The build script runs `prisma generate && next build`. Fix every TypeScript, ESLint, and Next.js build error that surfaces. The build **must** succeed with zero errors before the task is complete.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (`strict: false`) |
| UI Library | React 19 |
| Styling | Tailwind CSS 4, CSS custom properties |
| ORM | Prisma 6 (PostgreSQL via Supabase) |
| Realtime / Client DB | Supabase JS v2 |
| File Storage | Vercel Blob |
| Icons | lucide-react |
| Testing | Playwright |
| Package Manager | **pnpm** (never npm or yarn) |

---

## Project Structure

```
src/
  app/           # Next.js App Router — pages and API routes
    api/         # API route handlers (route.ts files)
  components/    # Shared React components
  lib/           # Utilities, contexts, service clients
  types/         # TypeScript type definitions
prisma/
  schema.prisma  # Single source of truth for DB schema
supabase/
  migrations/    # SQL migration files
```

---

## Path Aliases

Always use the `@/` alias for imports from `src/`:

```ts
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/UI'
import { requireAdmin } from '@/lib/apiAuth'
```

Never use relative paths like `../../lib/prisma`.

---

## Database — Dual Client Pattern

This project uses **two database clients** for different purposes.

### Prisma — Server-side only (API routes)

Use Prisma for all mutations and queries inside API routes. Prisma bypasses Supabase Row Level Security (RLS).

```ts
import { prisma } from '@/lib/prisma'

const item = await prisma.item.findUnique({ where: { id } })
await prisma.item.update({ where: { id }, data: { name } })
```

### Supabase — Client-side (page components)

Use the Supabase client for read queries in client components. Supabase enforces RLS.

```ts
import { supabase } from '@/lib/supabase'

const { data, error } = await supabase.from('items').select('*')
```

**Rule:** Never use Prisma in `'use client'` components. Never bypass RLS from client code.

---

## API Routes

- Every API route lives at `src/app/api/<name>/route.ts`.
- Use Next.js App Router handlers: `export async function GET(request: NextRequest)`.
- Always authenticate using `apiAuth.ts` helpers before processing.
- Use Prisma for all database operations inside API routes.
- Return `NextResponse.json()` with appropriate HTTP status codes.

### Authentication in API routes

```ts
import { requireAuth, requireAdmin } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  // Require admin role — returns NextResponse error if unauthorized
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json()
    // ... use prisma here
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## Authentication & Authorization

### Roles

Three roles exist: `'admin'`, `'staff'`, `'user'`.
Type: `UserRole = 'admin' | 'user' | 'staff'` (defined in both `apiAuth.ts` and `AuthContext.tsx`).

### Client-side

- `AuthContext` (`src/lib/AuthContext.tsx`) provides `user`, `isAdmin`, `isAuthenticated`, `hasRole()`.
- `AuthGuard` component wraps protected pages.
- `LayoutWrapper` handles route-based layout and auth gate automatically.

### Route configuration

All route lists live in `src/lib/routes.ts`. When adding new routes:

- Add public routes to `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PREFIXES`.
- Add admin routes to `ADMIN_ROUTES` / `ADMIN_ROUTE_PREFIXES`.
- Add protected API routes to `PROTECTED_API_ROUTES`.
- **Also update** `src/middleware.ts` to mirror these lists — middleware and `routes.ts` must stay in sync.

---

## Page Components

Every admin page follows this structure:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, PageContainer, Button, LoadingSpinner, EmptyState } from '@/components/UI'
import { SomeIcon } from 'lucide-react'

export default function MyPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MyType[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data, error } = await supabase.from('my_table').select('*')
    if (!error) setData(data ?? [])
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <>
      <PageHeader
        title="Page Title"
        subtitle="Optional subtitle"
        icon={<SomeIcon size={20} />}
        action={<Button onClick={handleAdd}>Add</Button>}
      />
      <PageContainer>
        {data.length === 0
          ? <EmptyState icon={SomeIcon} title="No items" />
          : /* render data */
        }
      </PageContainer>
    </>
  )
}
```

---

## Components

### Shared UI (`src/components/UI.tsx`)

Always import shared components from `@/components/UI`:

```ts
import {
  PageHeader, PageContainer, Button, Input, Select,
  Badge, LoadingSpinner, LoadingCard, EmptyState,
  CurrencyToggle
} from '@/components/UI'
```

- All shared components are wrapped in `memo()` for performance.
- Use `forwardRef` when a component must forward a ref.

### Naming conventions

- Component files: `PascalCase.tsx`
- Component functions: `PascalCase`
- Wrap exported components with `memo`: `export const MyComponent = memo(MyComponentFn)`

---

## Styling

### Design system

The app uses a **dark theme** defined via CSS custom properties in `src/app/globals.css`.

Brand colors:
- Background: `#141c2e` → `var(--background)`
- Primary/Accent: `#f97015` orange → `var(--primary)`

### Tailwind classes

- Use Tailwind v4 utility classes.
- Prefer semantic CSS variable classes: `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`.
- Use the `cn()` utility for dynamic class merging:

```ts
import { cn } from '@/lib/utils'

<div className={cn('base-classes', condition && 'conditional-class', className)} />
```

### Responsive design

- Mobile-first: default styles for mobile, `sm:` and `lg:` for larger screens.
- Admin layout uses bottom nav on mobile (`pb-24` padding) and sidebar on desktop.
- Use `hidden sm:block` / `hidden lg:block` patterns for responsive visibility.

---

## Currency

The app operates in **SRD** (Surinamese Dollar) and **USD**.

```ts
import { formatCurrency, type Currency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'

formatCurrency(amount, 'SRD') // → "SRD 150"
formatCurrency(amount, 'USD') // → "$12.50"

const { displayCurrency, convertToDisplay, exchangeRate } = useCurrency()
```

- All prices are stored in **USD** in the database.
- Convert to the display currency on render using `CurrencyContext`.
- Never hard-code exchange rates.

---

## Activity Logging

Log all create, update, and delete operations:

```ts
import { logActivity } from '@/lib/activityLog'

await logActivity({
  action: 'create',   // 'create' | 'update' | 'delete' | 'transfer' | 'complete' | 'cancel' | 'pay'
  entityType: 'item', // see EntityType union in activityLog.ts
  entityId: item.id,
  entityName: item.name,
  details: 'Optional context'
})
```

---

## Prisma Schema Rules

- Table names: `snake_case`, mapped via `@@map("table_name")`.
- Column names: `snake_case` in DB, `camelCase` in Prisma/TS via `@map("column_name")`.
- UUIDs: `@id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid`.
- Timestamps: `@db.Timestamptz(6)` with `@default(now())` and `@updatedAt`.
- After any schema change run `pnpm prisma generate` (already included in `pnpm build`).
- Never edit already-applied migration files. Create new ones instead.

---

## Images

- Always use Next.js `<Image>` from `next/image`.
- Vercel Blob URLs (`*.public.blob.vercel-storage.com`) are already whitelisted in `next.config.ts`.
- Use the `ImageUpload` component for uploads via `/api/upload`.
- Never set `unoptimized` globally on the Next.js image config.

---

## TypeScript Rules

- `strict` is **false** — but write correct types anyway.
- Use generated `Database` types for Supabase rows:

```ts
import { Database } from '@/types/database.types'
type Item = Database['public']['Tables']['items']['Row']
```

- Use `type` for type-only imports: `import type { X } from '...'`.
- Avoid `any`; prefer `unknown` with narrowing when the type is truly unknown.

---

## Error Handling

- API routes: wrap all logic in `try/catch`, return `{ error: string }` with the correct HTTP status code.
- Client components: always check the `error` field from Supabase destructured responses.
- Always `console.error` on the server for unexpected errors.
- Never expose raw error messages to the client UI.

---

## Common Patterns

### Confirm dialogs

```ts
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'

const { dialogProps, confirm } = useConfirmDialog()
await confirm({ title: 'Delete?', description: 'This cannot be undone.' })

<ConfirmDialog {...dialogProps} />
```

### Modals

```ts
import { Modal } from '@/components/PageCards'

<Modal isOpen={open} onClose={() => setOpen(false)} title="Edit Item">
  {/* content */}
</Modal>
```

---

## Environment Variables

```
DATABASE_URL=                    # Prisma pooled connection
DIRECT_URL=                      # Prisma direct connection (for migrations)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
BLOB_READ_WRITE_TOKEN=           # Vercel Blob
```

`NEXT_PUBLIC_` variables are exposed to the browser. All others are server-only — never read them in client components.

---

## Checklist Before Finishing Any Task

1. `pnpm build` passes with **zero errors**.
2. New routes added to both `src/lib/routes.ts` **and** `src/middleware.ts`.
3. New DB tables/columns: update `prisma/schema.prisma` and add a new Supabase SQL migration file in `supabase/migrations/`.
4. All create/update/delete operations call `logActivity()`.
5. API routes use `requireAuth` or `requireAdmin` from `@/lib/apiAuth`.
6. No untyped `any` introduced without justification.
7. Images use Next.js `<Image>` component.
8. New reusable components are wrapped with `memo()`.

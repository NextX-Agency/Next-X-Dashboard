# Domain Configuration Guide

## Problem
The current Vercel URL `https://nextx-dashboard.vercel.app/catalog` contains "dashboard" which makes it look like an internal tool rather than a customer-facing store.

## Solutions Implemented

### 1. ✅ Better Meta Tags (Done)
- Added catalog-specific metadata for better SEO
- Configured Open Graph tags for social media sharing
- When shared on WhatsApp, Facebook, Twitter, etc., it will show as "NextX - Product Catalog"

### 2. ✅ URL Aliases (Done)
- Added redirects so users can also access via:
  - `/shop` → redirects to `/catalog`
  - `/store` → redirects to `/catalog`

### 3. 🔧 Custom Domain Setup (Recommended)

#### To completely remove "dashboard" from the URL, set up a custom domain:

**Step 1: Go to Vercel Dashboard**
1. Log in to [vercel.com](https://vercel.com)
2. Select your "nextx-dashboard" project
3. Go to **Settings** → **Domains**

**Step 2: Add a Custom Domain**
Choose one of these options:

**Option A: Buy a New Domain** (Recommended for professional store)
- Examples:
  - `nextx.store`
  - `nextx-shop.com`
  - `nextxcatalog.com`
- Click "Add" and purchase directly through Vercel

**Option B: Use a Subdomain** (If you own a domain)
- Examples:
  - `shop.yourdomain.com`
  - `catalog.yourdomain.com`
  - `store.yourdomain.com`
- Add the subdomain and configure DNS records as shown by Vercel

**Step 3: Set as Production Domain**
- Once added, mark your custom domain as the "Production Domain"
- This ensures all shared links use the custom domain automatically

**Step 4: Deploy**
```bash
pnpm build
git add .
git commit -m "Add custom domain configuration"
git push
```

## Result
After setting up a custom domain:
- ❌ Old: `https://nextx-dashboard.vercel.app/catalog`
- ✅ New: `https://nextx.store/catalog` (or your chosen domain)

## Quick Test
Share the catalog link on WhatsApp or any social media:
- It will now show as "NextX - Product Catalog"
- Much more professional appearance
- No "dashboard" reference in the share preview

## Notes
- The vercel.app domain will still work but won't be the primary URL
- Custom domains are free with Vercel
- SSL certificates are automatically provided
- DNS changes can take up to 48 hours to propagate globally

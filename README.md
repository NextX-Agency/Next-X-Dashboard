# Next-X-Dashboard

**Serverless** mobile-first dashboard application built with Next.js and Supabase.

## 🌟 Architecture

This is a **fully serverless** stack:
- ✅ **Frontend**: Next.js deployed on Vercel
- ✅ **Backend**: Next.js API Routes (no separate backend needed!)
- ✅ **Database**: Supabase (PostgreSQL + Auth + Storage)
- ✅ **Zero server maintenance** - focus on features, not infrastructure

## 📁 Project Structure

```
Next-X-Dashboard/
├── src/                    # Next.js application
│   ├── app/                # App Router
│   │   ├── api/            # API Routes (serverless backend)
│   │   │   ├── hello/      # Example endpoint
│   │   │   └── users/      # CRUD API example
│   │   ├── globals.css
│   │   ├── page.tsx
│   │   └── layout.tsx
│   └── lib/                # Utilities & Supabase client
│       ├── supabase.ts     # Supabase client configuration
│       └── utils.ts
│
├── public/                 # Static assets
├── supabase/              # Supabase configuration
│   └── config.toml
│
├── .env.local.example      # Environment variables template
├── .gitignore
├── components.json         # shadcn/ui configuration
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

✨ **Clean, Vercel-ready structure** - ready to deploy with a single `git push`!

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- pnpm package manager (`npm install -g pnpm`)
- Supabase account ([app.supabase.com](https://app.supabase.com))

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the example file and add your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project details:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> **Get your credentials**: Supabase Dashboard → Settings → API

### 3. Run Development Server

```bash
pnpm dev
```

Application will be available at: `http://localhost:3000`

### 4. (Optional) Local Supabase Development

```bash
# Install Supabase CLI
pnpm install -g supabase

# Start local Supabase instance
supabase start

# Stop Supabase
supabase stop
```

## 📦 Technology Stack

### Frontend & Backend (Unified)
- **Next.js 16** - React framework with App Router + API Routes
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - Re-usable component library
- **Lucide React** - Icon library

### Database & Backend Services
- **Supabase** - Complete backend-as-a-service
  - PostgreSQL database with Row Level Security (RLS)
  - Built-in authentication (email, OAuth, magic links)
  - File storage with CDN
  - Real-time subscriptions
  - Edge Functions (optional serverless functions)

### Deployment
- **Vercel** - Serverless deployment platform (auto-deploy from Git)
- **Supabase Cloud** - Managed database and backend services

## 🔧 Environment Configuration

Create `.env.local` in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

For production deployment on Vercel, add these environment variables in your Vercel project settings.

## 🔌 API Routes (Serverless Backend)

Your backend logic lives in `frontend/src/app/api/`. Example endpoints:

- **GET** `/api/hello` - Simple hello world endpoint
- **GET** `/api/users` - Get all users from Supabase
- **POST** `/api/users` - Create a new user
- **GET** `/api/users/[id]` - Get a specific user
- **PUT** `/api/users/[id]` - Update a user
- **DELETE** `/api/users/[id]` - Delete a user

All API routes are automatically deployed as serverless functions on Vercel.

## 🚀 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy! 🎉

Vercel will automatically:
- Build your Next.js app
- Deploy static pages to CDN
- Deploy API routes as serverless functions
- Set up automatic deployments on Git push

### Supabase Setup

1. Create a project at [app.supabase.com](https://app.supabase.com)
2. Create your database tables in the SQL Editor or Table Editor
3. Copy your project URL and anon key to environment variables
4. (Optional) Set up Row Level Security (RLS) policies for data protection

## 📝 Adding Features

### Add shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add card
pnpm dlx shadcn@latest add dialog
# etc...
```

### Create New API Routes

Create a new file in `src/app/api/your-route/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('your_table')
    .select('*')
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ data })
}
```

## 🎯 Mobile-First Approach

This project follows mobile-first design principles:
- Responsive layouts using Tailwind CSS
- Touch-friendly UI components from shadcn/ui
- Optimized for mobile performance
- Progressive enhancement for larger screens
- Serverless architecture for instant global scaling

## 💡 Why Serverless?

- ✅ **No server management** - focus on code, not infrastructure
- ✅ **Auto-scaling** - handles traffic spikes automatically
- ✅ **Pay-per-use** - only pay for what you use
- ✅ **Global CDN** - fast performance worldwide
- ✅ **Built-in CI/CD** - deploy on every Git push
- ✅ **Zero downtime** - automatic rolling deployments
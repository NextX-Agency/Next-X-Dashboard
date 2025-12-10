# Next-X-Dashboard

Mobile-first dashboard application with Next.js frontend and NestJS backend, powered by Supabase.

## 📁 Project Structure

```
Next-X-Dashboard/
├── frontend/                # Next.js frontend application
│   ├── src/
│   │   ├── app/            # App Router pages and layouts
│   │   ├── components/     # React components
│   │   │   └── ui/         # shadcn/ui components
│   │   └── lib/            # Utility functions
│   ├── public/             # Static assets
│   ├── components.json     # shadcn/ui configuration
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                # NestJS backend application
│   ├── src/
│   │   ├── app.controller.ts
│   │   ├── app.module.ts
│   │   ├── app.service.ts
│   │   └── main.ts
│   ├── test/               # E2E tests
│   ├── package.json
│   └── tsconfig.json
│
├── supabase/              # Supabase configuration
│   ├── migrations/        # Database migrations
│   ├── functions/         # Edge functions
│   ├── seed/              # Seed data
│   └── config.toml        # Supabase config
│
└── README.md
```

## 🚀 Setup Commands

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Frontend Setup (Next.js + Tailwind + shadcn/ui)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (already done during project setup)
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

Frontend will be available at: `http://localhost:3000`

### Backend Setup (NestJS)

```bash
# Navigate to backend directory
cd backend

# Install dependencies (already done during project setup)
npm install

# Run development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod

# Run tests
npm run test

# Run E2E tests
npm run test:e2e
```

Backend API will be available at: `http://localhost:3001`

### Supabase Setup

```bash
# Install Supabase CLI globally (if not already installed)
npm install -g supabase

# Initialize Supabase (if needed)
supabase init

# Start Supabase local development
supabase start

# Stop Supabase
supabase stop
```

## 📦 Technology Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - Re-usable component library
- **Lucide React** - Icon library

### Backend
- **NestJS 11** - Progressive Node.js framework
- **TypeScript** - Type-safe JavaScript
- **Jest** - Testing framework

### Database & Storage
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Storage
  - Real-time subscriptions

## 🔧 Environment Configuration

### Frontend Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend Environment Variables

Create `backend/.env`:

```env
PORT=3001
NODE_ENV=development
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

## 📝 Next Steps

The project structure and dependencies are now set up. Ready for feature development.

To add shadcn/ui components:

```bash
cd frontend
npx shadcn@latest add button
npx shadcn@latest add card
# etc...
```

## 🎯 Mobile-First Approach

This project follows mobile-first design principles:
- Responsive layouts using Tailwind CSS
- Touch-friendly UI components from shadcn/ui
- Optimized for mobile performance
- Progressive enhancement for larger screens
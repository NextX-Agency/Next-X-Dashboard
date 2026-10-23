FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Public config is needed while Next.js builds its image allow-list and client
# bundle. The production config rejects managed Supabase hosts and requires an
# HTTPS app URL. No database or Storage secret is passed to the image build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Production prerender validates database configuration even though app data
# is loaded at request time. Keep non-secret self-hosted placeholders in the
# builder so image builds need neither a running database nor runtime
# credentials. The runner stage receives the real private URLs from Coolify.
ENV NEXTLY_DATABASE_MODE=self-hosted
ENV DATABASE_URL=postgresql://postgres@supavisor:6543/postgres
ENV DIRECT_URL=postgresql://postgres@db:5432/postgres

RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
# Record the exact source commit in the image so a running container can be traced to Git.
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.revision=$GIT_COMMIT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p .next/cache \
  && chown -R nextjs:nodejs /app
# `.next/cache` holds the optimised product photographs (next/image + sharp) and the Next.js
# data cache. It is empty after every deploy, so each photo is re-encoded on first view. Mount a
# persistent volume at /app/.next/cache in Coolify to keep it across deploys (the directory is
# created above owned by the unprivileged user, so a fresh named volume inherits that ownership).

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { const b = await r.json(); process.exit(r.ok && b.status === 'ready' ? 0 : 1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]

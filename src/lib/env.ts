import { z } from 'zod';

/**
 * Environment access.
 *
 * Validation is lazy and memoised rather than run at module load. Production
 * builds and runtime reject managed Supabase endpoints, while server-only
 * secrets are checked when a request genuinely needs them.
 */

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function isManagedPooler(value: string, port: string): boolean {
  try {
    const url = new URL(value);
    return url.port === port && url.hostname.endsWith('.pooler.supabase.com');
  } catch {
    return false;
  }
}

function isSupabaseCloudHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return (
    normalized === 'supabase.co' ||
    normalized.endsWith('.supabase.co') ||
    normalized.endsWith('.pooler.supabase.com')
  );
}

function requiresSelfHostedProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isSelfHostedPostgresUrl(value: string): boolean {
  try {
    return isPostgresUrl(value) && !isSupabaseCloudHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isSelfHostedSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !isSupabaseCloudHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isSupabaseUrlAllowed(value: string): boolean {
  return !requiresSelfHostedProduction() || isSelfHostedSupabaseUrl(value);
}

export function isPublicAppUrlAllowed(value: string): boolean {
  if (!requiresSelfHostedProduction()) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function allowsDatabaseUrl(value: string, port: string): boolean {
  if (requiresSelfHostedProduction()) {
    return process.env.NEXTLY_DATABASE_MODE === 'self-hosted' && isSelfHostedPostgresUrl(value);
  }
  if (isLocalRehearsalConnection(value) || isManagedPooler(value, port)) return true;
  return process.env.NEXTLY_DATABASE_MODE === 'self-hosted' && isPostgresUrl(value);
}

export function isLocalRehearsalConnection(value: string | undefined): boolean {
  if (process.env.NEXTLY_LOCAL_REHEARSAL !== '1') return false;
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '55432' &&
      url.pathname === '/nextly_migration_rehearsal'
    );
  } catch {
    return false;
  }
}

const databaseUrlSchema = z
  .string()
  .url('DATABASE_URL must be a PostgreSQL connection URL')
  .refine(
    (value) => allowsDatabaseUrl(value, '6543'),
    'DATABASE_URL must use the self-hosted private pooler in production; managed poolers are allowed only outside production',
  );

const directUrlSchema = z
  .string()
  .url('DIRECT_URL must be a PostgreSQL connection URL')
  .refine(
    (value) => allowsDatabaseUrl(value, '5432'),
    'DIRECT_URL must use the self-hosted private PostgreSQL service in production; managed URLs are allowed only outside production',
  );

const serverSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  NEXTLY_DATABASE_MODE: z.enum(['managed', 'self-hosted']).default('managed'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const migrationSchema = z.object({ DIRECT_URL: directUrlSchema });

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine(
      isSupabaseUrlAllowed,
      'Production must use the API/Auth/Storage URL of the self-hosted Supabase stack, not Supabase Cloud.',
    ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .refine(isPublicAppUrlAllowed, 'Production app URLs must use HTTPS.'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let serverCache: ServerEnv | undefined;
let publicCache: PublicEnv | undefined;

/**
 * An unset variable and a variable set to the empty string mean the same thing:
 * not configured. .env files cannot express `undefined`, so a placeholder line
 * like `DIRECT_URL=""` would otherwise fail an `.optional()` check and be far
 * more confusing than a missing line.
 */
function present(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

function fail(scope: string, error: z.ZodError): never {
  const detail = error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid ${scope} environment. Copy .env.example to .env.local and fill in:\n${detail}`,
  );
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(present(process.env));
  if (!parsed.success) fail('server', parsed.error);
  serverCache = parsed.data;
  return serverCache;
}

/** Non-throwing validation for setup and readiness screens. */
export function isServerEnvironmentValid(): boolean {
  return serverSchema.safeParse(present(process.env)).success;
}

/** Migration tooling uses the session pooler; the app itself does not. */
export function isMigrationEnvironmentValid(): boolean {
  return migrationSchema.safeParse(present({ DIRECT_URL: process.env.DIRECT_URL })).success;
}

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  // Next inlines NEXT_PUBLIC_* at build time only when referenced statically,
  // so these must be spelled out rather than read off a dynamic key.
  const parsed = publicSchema.safeParse(
    present({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    }),
  );
  if (!parsed.success) fail('public', parsed.error);
  publicCache = parsed.data;
  return publicCache;
}

export function publicAppUrl(): string {
  return publicEnv().NEXT_PUBLIC_APP_URL;
}

export function isStagingEnvironment(): boolean {
  return process.env.NEXTX_ENVIRONMENT === 'staging';
}

/** True once the database is reachable in this environment. Lets pages render
 *  a setup state instead of a stack trace before Supabase is provisioned. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

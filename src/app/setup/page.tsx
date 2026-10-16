import { Database } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/shell/wordmark';
import { isDatabaseConfigured, isServerEnvironmentValid } from '@/lib/env';

export const metadata: Metadata = { title: 'Setup' };

/**
 * Shown when there are no database credentials.
 *
 * Without a database there is no `members` table, so there is nobody to
 * authorise and no data to protect. Saying that plainly is better than a stack
 * trace, and better than a sign-in form that could never succeed.
 */
export default function SetupPage() {
  const databaseConfigured = isDatabaseConfigured();
  const environmentValid = isServerEnvironmentValid();
  if (databaseConfigured && environmentValid) redirect('/dashboard');

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <main className="w-full max-w-[520px]">
        <Wordmark />

        <div className="mt-8 flex size-9 items-center justify-center rounded-control bg-warning-muted text-warning">
          <Database className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          {databaseConfigured ? 'Check the database configuration' : 'Connect the database'}
        </h1>
        <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
          {databaseConfigured
            ? 'The database settings are present but do not match the selected deployment mode.'
            : 'Database connection settings are missing. Configure the private Supabase services before signing in.'}
        </p>

        <ol className="mt-6 space-y-4">
          <Step index={1} title="Configure the self-hosted Supabase stack">
            <p>
              In Coolify, confirm PostgreSQL, Auth, API and Storage are healthy. Keep database
              and pooler ports private; only the API origin needs a public HTTPS route.
            </p>
          </Step>

          <Step
            index={2}
            title={
              databaseConfigured
                ? 'Check the connection settings'
                : 'Set the connection settings'
            }
          >
            <dl className="mt-1 space-y-1.5">
              <Pair
                name="DATABASE_URL"
                value="Private self-hosted transaction pooler"
                why="Runtime connection over the Coolify network."
              />
              <Pair
                name="DIRECT_URL"
                value="Private PostgreSQL service, port 5432"
                why="Schema migrations and controlled import jobs."
              />
            </dl>
            <p className="mt-2 rounded-control border border-warning/40 bg-warning-muted px-2.5 py-2 text-[11px] text-ink-2 leading-relaxed">
              Production requires{' '}
              <span className="tabular">NEXTLY_DATABASE_MODE=self-hosted</span>, private VPS
              database URLs and an HTTPS{' '}
              <span className="tabular">NEXT_PUBLIC_SUPABASE_URL</span>. Managed Supabase URLs
              are rejected by the production runtime.
            </p>
          </Step>

          <Step index={3} title="Restart the app after setting its environment">
            <code className="tabular mt-1 inline-block rounded-control border border-line bg-inset px-2 py-1 text-[12px]">
              Coolify redeploy
            </code>
            <p className="mt-1">
              For local development, use <span className="tabular">pnpm dev</span> after
              updating
              <span className="tabular"> .env.local</span>. Create or invite the first owner
              through the documented Supabase Auth workflow.
            </p>
          </Step>
        </ol>

        <p className="mt-6 border-line-subtle border-t pt-4 text-[12px] text-ink-4 leading-relaxed">
          Full instructions, including deployment, are in{' '}
          <span className="tabular">docs/05-operations/environments.md</span>.
        </p>
      </main>
    </div>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line bg-inset text-[11px] text-ink-3">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[13px] text-ink">{title}</p>
        <div className="mt-1 text-[12px] text-ink-3 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function Pair({ name, value, why }: { name: string; value: string; why: string }) {
  return (
    <div className="rounded-control border border-line-subtle bg-inset px-2.5 py-2">
      <dt className="tabular text-[12px] text-ink-2">{name}</dt>
      <dd className="text-[11px] text-ink-3">
        {value} <span className="text-ink-4">— {why}</span>
      </dd>
    </div>
  );
}

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const REQUIRED_READINESS_GATES = [
  'FEATURE_PARITY',
  'SELF_HOSTING',
  'COOLIFY_STAGING',
  'SUPABASE_RUNTIME',
  'RLS',
  'MEDIA',
  'BACKUP_RESTORE',
  'MIGRATION_DRY_RUN',
  'RECONCILIATION',
  'TESTS',
] as const;

export type ReadinessGate = (typeof REQUIRED_READINESS_GATES)[number];

export type ReadinessReport = {
  generatedAt: string;
  workingTreeFingerprint: string;
  gates: Record<ReadinessGate, 'PASS'>;
};

export const MEDIA_PREPARATION_REQUIRED_GATES = [
  'SELF_HOSTING',
  'COOLIFY_STAGING',
  'SUPABASE_RUNTIME',
  'RLS',
] as const satisfies readonly ReadinessGate[];

export type MediaPreparationReadinessReport = {
  phase: 'MEDIA_PREPARATION';
  generatedAt: string;
  workingTreeFingerprint: string;
  targetEnvironment: 'staging';
  stagingHost: string;
  storageSmokeTest: 'PASS';
  gates: Partial<Record<(typeof MEDIA_PREPARATION_REQUIRED_GATES)[number], 'PASS'>>;
};

function gitOutput(root: string, args: string[]): Buffer {
  return execFileSync('git', args, { cwd: root, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] }) as Buffer;
}

export async function workingTreeFingerprint(cwd = process.cwd()): Promise<{ head: string; fingerprint: string }> {
  const root = gitOutput(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const head = gitOutput(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const status = gitOutput(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const records = status.toString('utf8').split('\0');
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    paths.push(record.slice(3));
    if (/^[RC]/.test(record.slice(0, 2))) {
      const secondPath = records[index + 1];
      if (secondPath) paths.push(secondPath);
      index += 1;
    }
  }

  const hash = createHash('sha256').update(head).update(status);
  for (const path of [...new Set(paths)].sort()) {
    const absolutePath = resolve(root, path);
    const fromRoot = relative(root, absolutePath);
    if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
      throw new Error('Git reported a changed path outside the repository root.');
    }
    hash.update(path).update('\0');
    try {
      const details = await lstat(absolutePath);
      if (details.isSymbolicLink()) {
        hash.update('symlink\0').update(await readlink(absolutePath));
      } else if (details.isFile()) {
        hash.update('file\0').update(await readFile(absolutePath));
      } else {
        hash.update(`other:${details.mode}\0`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      hash.update('deleted\0');
    }
  }
  return { head, fingerprint: hash.digest('hex') };
}

export function assertReadinessReport(raw: unknown, currentFingerprint: string): ReadinessReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The readiness report must be a JSON object.');
  }
  const report = raw as Record<string, unknown>;
  if (typeof report.generatedAt !== 'string' || !Number.isFinite(Date.parse(report.generatedAt))) {
    throw new Error('The readiness report must include a valid generatedAt timestamp.');
  }
  if (report.workingTreeFingerprint !== currentFingerprint) {
    throw new Error('The readiness report does not match the current working tree; rerun the required gates.');
  }
  if (!report.gates || typeof report.gates !== 'object' || Array.isArray(report.gates)) {
    throw new Error('The readiness report must include a gates object.');
  }
  const gates = report.gates as Record<string, unknown>;
  const failed = REQUIRED_READINESS_GATES.filter((gate) => gates[gate] !== 'PASS');
  if (failed.length > 0) {
    throw new Error(`Media writes are blocked until every readiness gate is PASS: ${failed.join(', ')}.`);
  }
  return report as ReadinessReport;
}

export function assertMediaPreparationReport(
  raw: unknown,
  currentFingerprint: string,
  expectedStagingHost: string,
): MediaPreparationReadinessReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The media preparation report must be a JSON object.');
  }
  const report = raw as Record<string, unknown>;
  if (report.phase !== 'MEDIA_PREPARATION') {
    throw new Error('Media preparation requires a MEDIA_PREPARATION phase report.');
  }
  if (typeof report.generatedAt !== 'string' || !Number.isFinite(Date.parse(report.generatedAt))) {
    throw new Error('The media preparation report must include a valid generatedAt timestamp.');
  }
  if (report.workingTreeFingerprint !== currentFingerprint) {
    throw new Error('The media preparation report does not match the current working tree; rerun the required gates.');
  }
  if (report.targetEnvironment !== 'staging') {
    throw new Error('Media preparation reports must be explicitly limited to staging.');
  }
  if (
    typeof report.stagingHost !== 'string' ||
    report.stagingHost.trim().toLowerCase() !== expectedStagingHost.trim().toLowerCase()
  ) {
    throw new Error('The media preparation report does not match NEXTX_STAGING_HOST.');
  }
  if (report.storageSmokeTest !== 'PASS') {
    throw new Error('Media preparation requires a passing Storage smoke test covering upload, public-read, and delete.');
  }
  if (!report.gates || typeof report.gates !== 'object' || Array.isArray(report.gates)) {
    throw new Error('The media preparation report must include a gates object.');
  }
  const gates = report.gates as Record<string, unknown>;
  const failed = MEDIA_PREPARATION_REQUIRED_GATES.filter((gate) => gates[gate] !== 'PASS');
  if (failed.length > 0) {
    throw new Error(`Media preparation is blocked until its staging prerequisites pass: ${failed.join(', ')}.`);
  }
  return report as unknown as MediaPreparationReadinessReport;
}

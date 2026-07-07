import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type TerminalSourceKind = 'history' | 'log'

type TerminalSourceCandidate = {
  id: string
  label: string
  kind: TerminalSourceKind
  filePath: string
}

type TerminalSourceResult = {
  id: string
  label: string
  kind: TerminalSourceKind
  path: string
  available: boolean
  lines: number
  updatedAt: string | null
  truncated: boolean
  error?: string
  entries: TerminalHistoryEntry[]
}

type TerminalHistoryEntry = {
  id: string
  sourceId: string
  source: string
  kind: TerminalSourceKind
  lineNumber: number
  text: string
  redacted: boolean
}

const DEFAULT_LINES_PER_SOURCE = 250
const MAX_LINES_PER_SOURCE = 1000
const MAX_SOURCE_BYTES = 2 * 1024 * 1024

function clampLines(value: string | null) {
  const parsed = Number(value ?? DEFAULT_LINES_PER_SOURCE)
  if (!Number.isFinite(parsed)) return DEFAULT_LINES_PER_SOURCE
  return Math.max(50, Math.min(MAX_LINES_PER_SOURCE, Math.floor(parsed)))
}

function uniqueSources(sources: TerminalSourceCandidate[]) {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const key = path.resolve(source.filePath).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getTerminalSources(): TerminalSourceCandidate[] {
  const home = os.homedir()
  const appData = process.env.APPDATA
  const devLogPath = process.env.NEXT_X_TERMINAL_LOG_PATH || path.join(os.tmpdir(), 'next-x-dashboard-dev.log')

  return uniqueSources([
    ...(appData ? [{
      id: 'powershell-history-appdata',
      label: 'PowerShell history',
      kind: 'history' as const,
      filePath: path.join(appData, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt'),
    }] : []),
    {
      id: 'powershell-history-home',
      label: 'PowerShell history',
      kind: 'history',
      filePath: path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt'),
    },
    {
      id: 'pwsh-history',
      label: 'PowerShell Core history',
      kind: 'history',
      filePath: path.join(home, '.local', 'share', 'powershell', 'PSReadLine', 'ConsoleHost_history.txt'),
    },
    {
      id: 'bash-history',
      label: 'Bash history',
      kind: 'history',
      filePath: path.join(home, '.bash_history'),
    },
    {
      id: 'zsh-history',
      label: 'Zsh history',
      kind: 'history',
      filePath: path.join(home, '.zsh_history'),
    },
    {
      id: 'next-dev-log',
      label: 'Next dev server log',
      kind: 'log',
      filePath: devLogPath,
    },
  ])
}

function redactSensitiveText(text: string) {
  let redacted = text

  redacted = redacted.replace(
    /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|DATABASE_URL|DIRECT_URL|SUPABASE_SERVICE_ROLE_KEY)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/gi,
    '$1=<redacted>'
  )
  redacted = redacted.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi, '<connection-url-redacted>')
  redacted = redacted.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
  redacted = redacted.replace(/\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+)\b/g, '<token-redacted>')

  return {
    text: redacted,
    redacted: redacted !== text,
  }
}

async function readTailText(filePath: string) {
  const stat = await fs.stat(filePath)
  const bytesToRead = Math.min(stat.size, MAX_SOURCE_BYTES)
  const start = Math.max(0, stat.size - bytesToRead)
  const handle = await fs.open(filePath, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    await handle.read(buffer, 0, bytesToRead, start)
    return {
      text: buffer.toString('utf8'),
      updatedAt: stat.mtime.toISOString(),
      truncated: stat.size > MAX_SOURCE_BYTES,
    }
  } finally {
    await handle.close()
  }
}

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
}

async function readSource(source: TerminalSourceCandidate, linesPerSource: number): Promise<TerminalSourceResult> {
  try {
    const { text, updatedAt, truncated } = await readTailText(source.filePath)
    const lines = parseLines(text)
    const visibleLines = lines.slice(-linesPerSource)
    const firstVisibleLine = Math.max(1, lines.length - visibleLines.length + 1)

    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      path: source.filePath,
      available: true,
      lines: lines.length,
      updatedAt,
      truncated,
      entries: visibleLines.map((line, index) => {
        const redactedLine = redactSensitiveText(line)
        const lineNumber = firstVisibleLine + index

        return {
          id: `${source.id}-${lineNumber}`,
          sourceId: source.id,
          source: source.label,
          kind: source.kind,
          lineNumber,
          text: redactedLine.text,
          redacted: redactedLine.redacted,
        }
      }),
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException

    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      path: source.filePath,
      available: false,
      lines: 0,
      updatedAt: null,
      truncated: false,
      error: nodeError.code === 'ENOENT' ? 'File not found' : 'Unable to read file',
      entries: [],
    }
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  const linesPerSource = clampLines(request.nextUrl.searchParams.get('lines'))
  const sources = await Promise.all(getTerminalSources().map(source => readSource(source, linesPerSource)))
  const sourceSummaries = sources.map(source => ({
    id: source.id,
    label: source.label,
    kind: source.kind,
    path: source.path,
    available: source.available,
    lines: source.lines,
    updatedAt: source.updatedAt,
    truncated: source.truncated,
    error: source.error,
  }))

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      linesPerSource,
      maxLinesPerSource: MAX_LINES_PER_SOURCE,
      redactionEnabled: true,
      sources: sourceSummaries,
      entries: sources.flatMap(source => source.entries),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}

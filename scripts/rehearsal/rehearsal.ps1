[CmdletBinding()]
param(
  [ValidateSet('start', 'stop', 'migrate', 'seed', 'validate', 'rls', 'constraints', 'concurrency', 'rehearse', 'help')]
  [string]$Command = 'help'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PgBin = if ($env:PG_BIN_DIR) { $env:PG_BIN_DIR } else { 'C:\Program Files\PostgreSQL\17\bin' }
$DataDir = Join-Path $RepoRoot '.local-rehearsal\pgdata'
$LogPath = Join-Path $RepoRoot '.local-rehearsal\postgres.log'
$Port = 55432
$DbName = 'nextly_migration_rehearsal'
$Connection = "postgresql://postgres@127.0.0.1:$Port/$DbName"
$AdminConnection = "postgresql://postgres@127.0.0.1:$Port/postgres"
$Source = Join-Path $RepoRoot 'tests\fixtures\nextx-sanitized.json'

function Invoke-Pg([string]$Executable, [string[]]$Arguments) {
  $path = Join-Path $PgBin $Executable
  if (-not (Test-Path -LiteralPath $path)) { throw "PostgreSQL binary not found: $path" }
  & $path @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}

function Is-Running {
  $path = Join-Path $PgBin 'pg_ctl.exe'
  if (-not (Test-Path -LiteralPath $DataDir)) { return $false }
  & $path status -D $DataDir *> $null
  return $LASTEXITCODE -eq 0
}

function Start-Rehearsal {
  New-Item -ItemType Directory -Force -Path (Split-Path $LogPath -Parent) | Out-Null
  if (-not (Test-Path -LiteralPath $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Invoke-Pg 'initdb.exe' @('-D', $DataDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--locale=C')
  }
  if (-not (Is-Running)) {
    Invoke-Pg 'pg_ctl.exe' @('-D', $DataDir, '-o', "-p $Port -h 127.0.0.1", '-l', $LogPath, 'start')
  }
  Invoke-Pg 'pg_isready.exe' @('-h', '127.0.0.1', '-p', "$Port", '-d', 'postgres')
  Invoke-Pg 'psql.exe' @($AdminConnection, '-v', 'ON_ERROR_STOP=1', '-c', "DO `$`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END `$`$;")
  $databaseExists = & (Join-Path $PgBin 'psql.exe') $AdminConnection '-tAc' "SELECT 1 FROM pg_database WHERE datname = '$DbName'" | Out-String
  if ($databaseExists.Trim() -ne '1') {
    Invoke-Pg 'createdb.exe' @($AdminConnection, $DbName)
  }
  Invoke-Pg 'psql.exe' @($Connection, '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'auth-compat.sql'))
  Write-Host "Local rehearsal PostgreSQL is ready: $Connection"
}

function Stop-Rehearsal {
  if (Is-Running) {
    Invoke-Pg 'pg_ctl.exe' @('-D', $DataDir, '-m', 'fast', 'stop')
    Write-Host 'Local rehearsal PostgreSQL stopped.'
  } else {
    Write-Host 'Local rehearsal PostgreSQL was already stopped.'
  }
}

function Set-RehearsalEnvironment {
  $env:NEXTLY_LOCAL_REHEARSAL = '1'
  $env:DATABASE_URL = $Connection
  $env:DIRECT_URL = $Connection
}

function Invoke-Pnpm([string[]]$Arguments) {
  Set-RehearsalEnvironment
  & pnpm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Apply-Seed {
  Invoke-Pg 'psql.exe' @($Connection, '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'seed.sql'))
}

function Invoke-Validation {
  Invoke-Pg 'psql.exe' @($Connection, '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'verify-schema.sql'))
  Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/validate-import.ts')
}

switch ($Command) {
  'start' { Start-Rehearsal }
  'stop' { Stop-Rehearsal }
  'migrate' { Start-Rehearsal; Invoke-Pnpm @('db:migrate') }
  'seed' { Start-Rehearsal; Apply-Seed }
  'validate' { Start-Rehearsal; Invoke-Validation }
  'rls' { Start-Rehearsal; Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/rls-runtime.ts') }
  'constraints' { Start-Rehearsal; Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/constraints.ts') }
  'concurrency' { Start-Rehearsal; Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/concurrency.ts') }
  'rehearse' {
    Start-Rehearsal
    Invoke-Pnpm @('db:migrate')
    Apply-Seed
    Invoke-Pnpm @('migrate:nextx:inspect', '--', '--source', $Source, '--out', 'migration-reports/local-rehearsal-inspect.json')
    Invoke-Pnpm @('migrate:nextx:dry-run', '--', '--source', $Source, '--out', 'migration-reports/local-rehearsal-dry-run.json')
    Invoke-Pnpm @('migrate:nextx:run', '--', '--source', $Source, '--target-environment', 'local', '--confirm-safe-target', 'local', '--out', 'migration-reports/local-rehearsal-import.json')
    Invoke-Pnpm @('migrate:nextx:run', '--', '--source', $Source, '--target-environment', 'local', '--confirm-safe-target', 'local', '--out', 'migration-reports/local-rehearsal-import-second-run.json')
    Invoke-Validation
    Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/rls-runtime.ts')
    Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/constraints.ts')
    Invoke-Pnpm @('exec', 'tsx', 'scripts/rehearsal/concurrency.ts')
  }
  default {
    Write-Host 'Commands: start, migrate, seed, validate, rls, constraints, concurrency, rehearse, stop'
    Write-Host "Database: $DbName on 127.0.0.1:$Port"
    Write-Host 'The cluster lives under .local-rehearsal and is never the PostgreSQL service on port 5432.'
  }
}

export const BACKUP_VERSION = 3
export const WIPE_RESTORE_CONFIRMATION = 'WIPE DATABASE'

export type BackupKind = 'manual' | 'auto' | 'pre-restore' | 'unknown'

export interface BackupPayload {
  version: number
  backupId: string
  createdAt: string
  type: BackupKind | string
  tableOrder: string[]
  rowCounts: Record<string, number>
  totalRows: number
  checksum: string
  tables: Record<string, unknown[]>
}

export interface BackupValidationSummary {
  backupId: string
  createdAt: string
  type: string
  version: number
  totalRows: number
  tableCount: number
  hasChecksum: boolean
  checksumMatches: boolean
  missingTables: string[]
  extraTables: string[]
}

export interface BackupValidationResult {
  valid: boolean
  issues: string[]
  warnings: string[]
  summary: BackupValidationSummary
  backup?: BackupPayload
}

export interface BackupBlobFile {
  url: string
  pathname: string
  size: number
  uploadedAt: string
}

export interface BackupBlobSaveResult {
  success: boolean
  url: string
  pathname: string
  size: number
  createdAt: string
}

export interface BackupSelfCheckResponse {
  success: boolean
  checkedAt: string
  totalRows: number
  exportValidation: BackupValidationSummary
  roundTripValidation: BackupValidationSummary
  temporaryBlob: {
    pathname: string
    cleanedUp: boolean
  }
}

export interface RestoreResponse {
  success: boolean
  mode: 'wipe' | 'merge'
  totalRows: number
  errors?: string[]
  validation?: BackupValidationSummary
  safetyBackup?: {
    url: string
    pathname: string
    createdAt: string
  }
}

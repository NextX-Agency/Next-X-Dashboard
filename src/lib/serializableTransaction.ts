import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Run a financial write as one Serializable transaction, retrying if Postgres
 * aborts it for a write conflict.
 *
 * Serializable is required for every financial write (R7), and it does its job:
 * two sales hitting the same wallet and stock rows at once will make Postgres
 * abort one of them rather than let it interleave. But an aborted transaction
 * commits nothing, so the only correct response is to run it again — otherwise
 * the register simply refuses a legitimate sale whenever two tills ring up at
 * the same moment.
 *
 * Retrying is safe precisely because the failed attempt left nothing behind.
 * Only P2034 (write conflict / deadlock) and Postgres 40001 / 40P01 are
 * retried; a validation error or a constraint violation is a real failure and
 * is rethrown immediately.
 */

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 25
const TRANSACTION_TIMEOUT_MS = 15000

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034'
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // Conflicts raised mid-statement surface as an unknown request error
    // carrying the Postgres SQLSTATE in the message: 40001 serialization
    // failure, 40P01 deadlock detected.
    return /40001|40P01|could not serialize|deadlock detected/i.test(error.message)
  }
  return false
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runSerializableTransaction<T>(
  handler: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxAttempts?: number; timeoutMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS
  const timeout = options?.timeoutMs ?? TRANSACTION_TIMEOUT_MS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(handler, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout,
        maxWait: timeout,
      })
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === maxAttempts) throw error
      lastError = error
      // Exponential backoff with jitter, so two conflicting writers do not
      // retry in lockstep and conflict again.
      await wait(BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + Math.random()))
    }
  }

  throw lastError
}

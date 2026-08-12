import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64
const HASH_PREFIX = 'scrypt'

export interface PasswordVerification {
  valid: boolean
  needsRehash: boolean
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedValue: string): Promise<PasswordVerification> {
  const [prefix, salt, storedKey] = storedValue.split('$')

  if (prefix === HASH_PREFIX && salt && storedKey) {
    const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer
    const expectedKey = Buffer.from(storedKey, 'hex')

    return {
      valid: expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey),
      needsRehash: false,
    }
  }

  // Existing accounts were stored as plaintext by the legacy login route.
  // Accepting that value once lets us upgrade it at the next successful login
  // without forcing an unexpected reset or changing existing data in a migration.
  const valid = storedValue.length === password.length
    && timingSafeEqual(Buffer.from(storedValue), Buffer.from(password))

  return { valid, needsRehash: valid }
}

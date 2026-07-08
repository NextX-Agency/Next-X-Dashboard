'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { UserCheck } from 'lucide-react'

export type OperatorProfile = {
  id: string
  name: string
  setAt: string
}

type OperatorContextValue = {
  profile: OperatorProfile | null
  openOperatorDialog: () => void
  updateOperator: (name: string) => void
}

const OPERATOR_PROFILE_STORAGE_KEY = 'nextx_operator_profile'
const OPERATOR_SESSION_STORAGE_KEY = 'nextx_operator_session_id'
const MIN_OPERATOR_NAME_LENGTH = 2

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined)

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120)
}

function readProfile() {
  try {
    const rawProfile = window.localStorage.getItem(OPERATOR_PROFILE_STORAGE_KEY)
    if (!rawProfile) return null
    const profile = JSON.parse(rawProfile) as Partial<OperatorProfile>
    const name = normalizeName(profile.name ?? '')
    if (!profile.id || name.length < MIN_OPERATOR_NAME_LENGTH) return null

    return {
      id: profile.id,
      name,
      setAt: profile.setAt || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function ensureSessionId() {
  let sessionId = window.sessionStorage.getItem(OPERATOR_SESSION_STORAGE_KEY)
  if (!sessionId) {
    sessionId = createId()
    window.sessionStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, sessionId)
  }
  return sessionId
}

function encodeHeaderValue(value: string | null | undefined) {
  return encodeURIComponent(value ?? '')
}

function isSameOriginApi(input: RequestInfo | URL) {
  if (typeof window === 'undefined') return false

  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url

  const url = new URL(rawUrl, window.location.origin)
  return url.origin === window.location.origin && url.pathname.startsWith('/api/')
}

function patchFetchForOperatorHeaders() {
  if (typeof window === 'undefined') return

  const state = window as typeof window & {
    __nextxOperatorFetchPatched?: boolean
    __nextxOriginalFetch?: typeof fetch
  }

  if (state.__nextxOperatorFetchPatched) return

  state.__nextxOperatorFetchPatched = true
  state.__nextxOriginalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isSameOriginApi(input)) {
      return state.__nextxOriginalFetch!(input, init)
    }

    const profile = readProfile()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))

    if (profile) {
      headers.set('x-nextx-operator-id', encodeHeaderValue(profile.id))
      headers.set('x-nextx-operator-name', encodeHeaderValue(profile.name))
      headers.set('x-nextx-operator-session', encodeHeaderValue(ensureSessionId()))
      headers.set('x-nextx-operator-source', 'browser')
    }

    return state.__nextxOriginalFetch!(input, {
      ...init,
      headers,
    })
  }
}

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<OperatorProfile | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    patchFetchForOperatorHeaders()
    const storedProfile = readProfile()
    setProfile(storedProfile)
    setDialogOpen(!storedProfile)
    setNameInput(storedProfile?.name ?? '')
    ensureSessionId()
  }, [])

  const openOperatorDialog = useCallback(() => {
    setNameInput(profile?.name ?? '')
    setDialogOpen(true)
  }, [profile?.name])

  const updateOperator = useCallback((name: string) => {
    const normalizedName = normalizeName(name)
    if (normalizedName.length < MIN_OPERATOR_NAME_LENGTH) return

    const nextProfile: OperatorProfile = {
      id: profile?.id ?? createId(),
      name: normalizedName,
      setAt: new Date().toISOString(),
    }

    window.localStorage.setItem(OPERATOR_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile))
    setProfile(nextProfile)
    setDialogOpen(false)

    void fetch('/api/activity/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        entityType: 'settings',
        entityName: 'Operator Identity',
        details: `Operator set to ${normalizedName}`,
        operator: {
          id: nextProfile.id,
          name: nextProfile.name,
          session: ensureSessionId(),
        },
      }),
    }).catch(() => undefined)
  }, [profile?.id])

  const contextValue = useMemo(() => ({
    profile,
    openOperatorDialog,
    updateOperator,
  }), [openOperatorDialog, profile, updateOperator])

  const canSubmit = normalizeName(nameInput).length >= MIN_OPERATOR_NAME_LENGTH

  return (
    <OperatorContext.Provider value={contextValue}>
      {children}

      {dialogOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <form
            className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault()
              updateOperator(nameInput)
            }}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-orange-500/15 p-2 text-orange-400">
                <UserCheck size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Who is using the dashboard?</h2>
                <p className="mt-1 text-sm text-gray-400">This name is added to every activity log entry.</p>
              </div>
            </div>

            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Operator name
            </label>
            <input
              autoFocus
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="Example: Lorenzo"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-base text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
            />

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      )}
    </OperatorContext.Provider>
  )
}

export function useOperator() {
  const context = useContext(OperatorContext)
  if (!context) {
    return {
      profile: null,
      openOperatorDialog: () => undefined,
      updateOperator: () => undefined,
    } satisfies OperatorContextValue
  }
  return context
}

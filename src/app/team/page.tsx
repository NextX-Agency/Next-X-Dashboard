'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, Users } from 'lucide-react'

type Location = { id: string; name: string }
type TeamUser = { id: string; email: string; name: string | null; role: string; isActive: boolean | null; lastLoginAt: string | null; locationAccess: Array<{ locationId: string; canManageWallet: boolean; location: { name: string } }> }

interface TeamData { users: TeamUser[]; locations: Location[] }

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'seller', locationIds: [] as string[] })

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/users', { cache: 'no-store' })
    const payload = await response.json() as { data?: TeamData; error?: string }
    if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load accounts.')
    setData(payload.data)
  }, [])

  useEffect(() => { void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load accounts.')) }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to create account.')
      setForm({ name: '', email: '', password: '', role: 'seller', locationIds: [] })
      setSuccess('Individual account created. Share the temporary password privately and ask the person to sign in.')
      await load()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create account.')
    } finally { setSubmitting(false) }
  }

  return <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 pb-20 sm:p-6 lg:p-10">
    <header><p className="text-sm font-semibold text-primary">Account access</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Individual dashboard accounts</h1><p className="mt-2 text-sm text-muted-foreground">Create a separate login for each person. Seller access is limited to the locations selected below.</p></header>
    {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}
    {success && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-800">{success}</div>}
    <section className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold"><Plus size={19} className="text-primary" />Create account</h2><label className="mt-4 block text-sm font-medium">Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border bg-background p-3" required /></label><label className="mt-4 block text-sm font-medium">Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" className="mt-1 w-full rounded-xl border bg-background p-3" required /></label><label className="mt-4 block text-sm font-medium">Temporary password<input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" minLength={12} className="mt-1 w-full rounded-xl border bg-background p-3" required /></label><label className="mt-4 block text-sm font-medium">Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="seller">Seller</option><option value="staff">Staff</option><option value="admin">Administrator</option></select></label><fieldset className="mt-4"><legend className="text-sm font-medium">Allowed locations</legend><div className="mt-2 space-y-2">{data?.locations.map((location) => <label key={location.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.locationIds.includes(location.id)} onChange={(event) => setForm((current) => ({ ...current, locationIds: event.target.checked ? [...current.locationIds, location.id] : current.locationIds.filter((id) => id !== location.id) }))} />{location.name}</label>)}</div></fieldset><button disabled={submitting} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><KeyRound size={16} />Create secure login</button></form>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Users size={19} className="text-primary" />Current accounts</h2></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Locations</th><th className="px-4 py-3">Last sign-in</th></tr></thead><tbody>{data?.users.map((user) => <tr key={user.id} className="border-t"><td className="px-4 py-3"><p className="font-semibold">{user.name || 'Unnamed'}</p><p className="text-xs text-muted-foreground">{user.email}</p></td><td className="px-4 py-3 capitalize">{user.role}</td><td className="px-4 py-3 text-muted-foreground">{user.locationAccess.map((access) => access.location.name).join(', ') || '—'}</td><td className="px-4 py-3 text-muted-foreground">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td></tr>)}</tbody></table></div></section>
    </section>
  </main>
}

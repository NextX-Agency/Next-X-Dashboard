import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

/** Read-only options for the server-only supplier-bill approval form. */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const [wallets, locations, categories] = await Promise.all([
    prisma.wallet.findMany({ where: { companyId: company.id }, select: { id: true, personName: true, type: true, currency: true, location_id: true }, orderBy: [{ currency: 'asc' }, { personName: 'asc' }] }),
    prisma.location.findMany({ where: { companyId: company.id, is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  return NextResponse.json({ data: { wallets: wallets.map((wallet) => ({ ...wallet, label: `${wallet.personName} · ${wallet.type} (${wallet.currency})` })), locations, categories } }, { headers: { 'Cache-Control': 'no-store' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { billAmount, billClassification, billCurrency, billDate, parseBillText, text } from '@/lib/billOcr'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'

class BillInputError extends Error {}

function date(value: Date | null) { return value?.toISOString().slice(0, 10) ?? null }
function number(value: unknown) { return value == null ? null : Number(value) }
function serialise(bill: { id: string; sourceDocumentName: string; ocrProvider: string; vendorName: string | null; invoiceNumber: string | null; invoiceDate: Date | null; dueDate: Date | null; description: string | null; amount: unknown; currency: string | null; classification: string; categoryId: string | null; walletId: string | null; locationId: string | null; status: string; rejectionReason: string | null; expenseId: string | null; approvedAt: Date | null; postedAt: Date | null; createdAt: Date }) {
  return { ...bill, invoiceDate: date(bill.invoiceDate), dueDate: date(bill.dueDate), amount: number(bill.amount), approvedAt: bill.approvedAt?.toISOString() ?? null, postedAt: bill.postedAt?.toISOString() ?? null, createdAt: bill.createdAt.toISOString() }
}

function asError(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to process supplier bill.'
}

function draftPatch(body: Record<string, unknown>, current?: { vendorName: string | null; invoiceNumber: string | null; invoiceDate: Date | null; dueDate: Date | null; description: string | null; amount: unknown; currency: string | null; classification: string; categoryId: string | null; walletId: string | null; locationId: string | null }) {
  return {
    vendorName: body.vendorName === undefined ? current?.vendorName ?? null : text(body.vendorName, 'vendorName'),
    invoiceNumber: body.invoiceNumber === undefined ? current?.invoiceNumber ?? null : text(body.invoiceNumber, 'invoiceNumber'),
    invoiceDate: body.invoiceDate === undefined ? current?.invoiceDate ?? null : billDate(body.invoiceDate, 'invoiceDate'),
    dueDate: body.dueDate === undefined ? current?.dueDate ?? null : billDate(body.dueDate, 'dueDate'),
    description: body.description === undefined ? current?.description ?? null : text(body.description, 'description'),
    amount: body.amount === undefined ? (current?.amount == null ? null : Number(current.amount)) : billAmount(body.amount),
    currency: body.currency === undefined ? current?.currency ?? null : billCurrency(body.currency),
    classification: body.classification === undefined ? current?.classification ?? 'unclassified' : billClassification(body.classification),
    categoryId: body.categoryId === undefined ? current?.categoryId ?? null : text(body.categoryId, 'categoryId'),
    walletId: body.walletId === undefined ? current?.walletId ?? null : text(body.walletId, 'walletId'),
    locationId: body.locationId === undefined ? current?.locationId ?? null : text(body.locationId, 'locationId'),
  }
}

function requirePostable(bill: { vendorName: string | null; invoiceDate: Date | null; description: string | null; amount: unknown; currency: string | null; classification: string; walletId: string | null; locationId: string | null }) {
  if (!bill.vendorName) throw new BillInputError('Supplier is required before approval.')
  if (!bill.invoiceDate) throw new BillInputError('Invoice date is required before approval.')
  if (!bill.description || bill.description.length < 3) throw new BillInputError('A clear bill description is required before approval.')
  if (!bill.amount || Number(bill.amount) <= 0) throw new BillInputError('A positive bill amount is required before approval.')
  if (bill.currency !== 'SRD' && bill.currency !== 'USD') throw new BillInputError('Bill currency is required before approval.')
  if (!bill.walletId || !bill.locationId) throw new BillInputError('Select both a wallet and location before approval.')
  try { billClassification(bill.classification, true) } catch (error) { throw new BillInputError(asError(error)) }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const bills = await prisma.billInbox.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ data: bills.map(serialise) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const sourceText = text(body.ocrText, 'ocrText', true)!
    if (sourceText.length > 50000) throw new BillInputError('OCR text is too large.')
    const parsed = parseBillText(sourceText)
    const bill = await runSerializableTransaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { isActive: true }, select: { id: true } })
      if (!company) throw new BillInputError('No active company is configured.')
      const inferred = draftPatch({
        vendorName: body.vendorName ?? parsed.vendorName,
        invoiceNumber: body.invoiceNumber ?? parsed.invoiceNumber,
        invoiceDate: body.invoiceDate ?? parsed.invoiceDate,
        dueDate: body.dueDate ?? parsed.dueDate,
        description: body.description ?? parsed.description,
        amount: body.amount ?? parsed.amount,
        currency: body.currency ?? parsed.currency,
        classification: body.classification ?? 'unclassified',
        categoryId: body.categoryId,
        walletId: body.walletId,
        locationId: body.locationId,
      })
      return tx.billInbox.create({ data: { companyId: company.id, sourceDocumentName: text(body.sourceDocumentName, 'sourceDocumentName') ?? 'Pasted invoice text', sourceText, ocrProvider: 'supplied_text', ...inferred, uploadedBy: user.id } })
    })
    return NextResponse.json({ data: serialise(bill) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: asError(error) }, { status: error instanceof BillInputError ? 400 : 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const id = text(body.id, 'id', true)!
    const action = body.action
    const bill = await runSerializableTransaction(async (tx) => {
      const current = await tx.billInbox.findUnique({ where: { id } })
      if (!current) throw new BillInputError('Supplier bill not found.')
      if (current.status === 'posted' || current.status === 'rejected') throw new BillInputError('This bill is retained as immutable history.')

      if (action === 'update') {
        if (current.status !== 'draft') throw new BillInputError('Approved bills cannot be edited; reject and enter a corrected bill instead.')
        return tx.billInbox.update({ where: { id }, data: draftPatch(body, current) })
      }
      if (action === 'reject') {
        if (current.status !== 'draft') throw new BillInputError('Only an unapproved draft can be rejected.')
        const reason = text(body.rejectionReason, 'rejectionReason', true)!
        return tx.billInbox.update({ where: { id }, data: { status: 'rejected', rejectionReason: reason } })
      }
      if (action === 'approve') {
        if (current.status !== 'draft') throw new BillInputError('Only a draft bill can be approved.')
        requirePostable(current)
        const wallet = await tx.wallet.findFirst({ where: { id: current.walletId!, companyId: current.companyId, currency: current.currency! }, select: { id: true, location_id: true } })
        if (!wallet || wallet.location_id !== current.locationId) throw new BillInputError('Selected wallet must belong to the bill location and currency.')
        return tx.billInbox.update({ where: { id }, data: { status: 'approved', approvedBy: user.id, approvedAt: new Date() } })
      }
      if (action !== 'post') throw new BillInputError('Use update, approve, reject, or post.')
      if (current.status !== 'approved') throw new BillInputError('Approve this bill before posting it.')
      requirePostable(current)

      const wallet = await tx.wallet.findFirst({ where: { id: current.walletId!, companyId: current.companyId, currency: current.currency! }, select: { id: true, companyId: true, balance: true, personName: true, location_id: true } })
      if (!wallet || wallet.location_id !== current.locationId) throw new BillInputError('Selected wallet must belong to the bill location and currency.')
      const amount = Number(current.amount)
      if (Number(wallet.balance) < amount) throw new BillInputError('Insufficient wallet balance to post this approved bill.')
      await markFinanceLedgerRecorded(tx)
      const expense = await tx.expense.create({ data: { companyId: wallet.companyId, walletId: wallet.id, location_id: current.locationId, categoryId: current.categoryId, amount, currency: current.currency!, description: current.description!, expenseDate: current.invoiceDate!, vendorName: current.vendorName!, receiptNumber: current.invoiceNumber, classification: current.classification } })
      const debited = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } }, select: { balance: true } })
      const walletTransaction = await tx.wallet_transactions.create({ data: { companyId: wallet.companyId, wallet_id: wallet.id, expense_id: expense.id, type: 'debit', amount, balance_before: wallet.balance, balance_after: debited.balance, currency: current.currency, description: `Supplier bill ${current.invoiceNumber ?? current.id}: ${current.description}`, reference_type: 'bill_inbox', reference_id: current.id } })
      await recordFinanceLedgerEntry(tx, { companyId: wallet.companyId, walletTransactionId: walletTransaction.id, walletId: wallet.id, locationId: current.locationId, categoryId: current.categoryId, actorUserId: user.id, eventType: 'expense', direction: 'out', amount, currency: current.currency as 'SRD' | 'USD', sourceType: 'bill_inbox', sourceId: current.id, counterparty: current.vendorName, description: current.description, occurredAt: current.invoiceDate, metadata: { invoiceNumber: current.invoiceNumber, classification: current.classification, billId: current.id } })
      const posted = await tx.billInbox.update({ where: { id }, data: { status: 'posted', expenseId: expense.id, postedAt: new Date() } })
      await writeActivityLog({ action: 'create', entityType: 'expense', entityId: expense.id, entityName: current.vendorName, details: `Posted supplier bill ${current.invoiceNumber ?? current.id} as expense ${expense.id}.`, user, request, source: 'bill-inbox', client: tx })
      return posted
    })
    return NextResponse.json({ data: serialise(bill) })
  } catch (error) {
    return NextResponse.json({ error: asError(error) }, { status: error instanceof BillInputError ? 409 : 500 })
  }
}

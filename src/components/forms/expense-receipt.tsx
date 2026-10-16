'use client';

import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { EXPENSE_RECEIPT_BUCKET, MAX_EXPENSE_RECEIPT_BYTES } from '@/lib/expense-receipts';
import { createClient } from '@/lib/supabase/client';
import {
  finalizeExpenseReceiptUpload,
  getExpenseReceiptUrl,
  removeExpenseReceipt,
  startExpenseReceiptUpload,
} from '@/server/actions/expense-media';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
/** Private expense receipt controls; object keys never leave server actions. */
export function ExpenseReceipt({
  expenseId,
  hasReceipt,
  canUpload,
  canDelete,
}: {
  expenseId: string;
  hasReceipt: boolean;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [uploading, setUploading] = useState(false);

  const startUpload = useAction(startExpenseReceiptUpload);
  const finalizeUpload = useAction(finalizeExpenseReceiptUpload);
  const getReceiptUrl = useAction(getExpenseReceiptUrl);
  const removeReceipt = useAction(removeExpenseReceipt);

  async function requestReceiptLink() {
    try {
      const result = await getReceiptUrl.executeAsync({ expenseId });
      if (result?.serverError) throw new Error(result.serverError);
      if (!result?.data?.url) throw new Error('Could not create a secure receipt link.');
      setLink(result.data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the receipt');
    }
  }

  async function uploadReceipt() {
    if (!file) return;
    if (!ACCEPTED_TYPES.some((type) => type === file.type)) {
      toast.error('Choose a PDF, JPEG, PNG or WebP file.');
      return;
    }
    if (file.size === 0 || file.size > MAX_EXPENSE_RECEIPT_BYTES) {
      toast.error('Receipt files must be between 1 byte and 10 MB.');
      return;
    }

    setUploading(true);
    setLink(null);
    try {
      const ticket = await startUpload.executeAsync({
        expenseId,
        contentType: file.type as (typeof ACCEPTED_TYPES)[number],
      });
      if (ticket?.serverError) throw new Error(ticket.serverError);
      if (!ticket?.data?.path || !ticket.data.token) {
        throw new Error('Could not authorize the receipt upload.');
      }

      const { error } = await createClient()
        .storage.from(EXPENSE_RECEIPT_BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, {
          contentType: file.type,
        });
      if (error) throw new Error(error.message);

      const finalized = await finalizeUpload.executeAsync({
        expenseId,
        pathname: ticket.data.path,
      });
      if (finalized?.serverError) throw new Error(finalized.serverError);
      if (!finalized?.data?.hasReceipt) {
        throw new Error('The upload finished, but the receipt could not be saved.');
      }

      setFile(null);
      setOpen(false);
      toast.success('Receipt attached');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Receipt upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deleteReceipt() {
    try {
      const result = await removeReceipt.executeAsync({ expenseId });
      if (result?.serverError) throw new Error(result.serverError);
      if (!result?.data) throw new Error('Could not remove the receipt.');
      setConfirmingDelete(false);
      setOpen(false);
      setLink(null);
      toast.success('Receipt removed');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the receipt');
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={hasReceipt ? 'ghost' : 'secondary'}
        onClick={() => setOpen(true)}
        aria-label={hasReceipt ? 'Manage expense receipt' : 'Attach expense receipt'}
      >
        <Paperclip className="size-3.5" />
        {hasReceipt ? 'Receipt' : 'Attach receipt'}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setLink(null);
        }}
        title="Expense receipt"
        description="Receipts are stored privately. Secure links expire after one minute."
        footer={
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {hasReceipt ? (
          <SheetSection title="Attached file">
            <div className="flex flex-wrap items-center gap-2">
              {link ? (
                <a
                  className="inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3 text-[12px] text-ink hover:bg-inset"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="size-3.5" /> Open secure download
                </a>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={requestReceiptLink}
                >
                  <FileText className="size-3.5" /> Get secure link
                </Button>
              )}
              {canDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              ) : null}
            </div>
          </SheetSection>
        ) : null}

        {canUpload ? (
          <SheetSection title={hasReceipt ? 'Replace file' : 'Attach a file'}>
            <Field label="PDF, JPEG, PNG or WebP · up to 10 MB" htmlFor={inputId}>
              <Input
                id={inputId}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                disabled={uploading}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </Field>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={!file || uploading}
                onClick={() => void uploadReceipt()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {uploading ? 'Uploading…' : hasReceipt ? 'Replace receipt' : 'Upload receipt'}
              </Button>
              {file ? (
                <span className="max-w-48 truncate text-[11px] text-ink-4">{file.name}</span>
              ) : null}
            </div>
          </SheetSection>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Remove this receipt?"
        description="The private file will be deleted from Storage and detached from this expense. The expense and its ledger history stay unchanged."
        confirmLabel="Remove receipt"
        pending={removeReceipt.isPending}
        onConfirm={() => void deleteReceipt()}
      />
    </>
  );
}

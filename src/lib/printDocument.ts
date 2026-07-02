interface PrintHtmlDocumentOptions {
  title: string
  content: string
  styles?: string
}

const MAX_IMAGE_WAIT_MS = 500

const defaultReceiptStyles = `
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    color: #111827;
    background: #ffffff;
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
  }
  .invoice-header { text-align: center; margin-bottom: 30px; }
  .invoice-header h1 { color: #f97316; margin: 0; }
  .invoice-details { margin-bottom: 20px; }
  .invoice-details p { margin: 5px 0; color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; font-weight: 600; }
  .total-row { font-weight: bold; font-size: 1.1em; }
  .total-row td { border-top: 2px solid #333; }
  .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.9em; }
  .paid-stamp { color: #22c55e; font-weight: bold; font-size: 1.2em; margin-top: 10px; }
  .unpaid-stamp { color: #f97316; font-weight: bold; font-size: 1.2em; margin-top: 10px; }
  .print-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin: 0 0 20px;
    padding: 14px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .print-actions button {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
    padding: 10px 24px;
  }
  .print-actions .print-button { background: #f97316; }
  .print-actions .close-button { background: #6b7280; }
  @media print {
    body { padding: 0; max-width: none; }
    .print-actions { display: none !important; }
  }
`

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isIOSPrintContext() {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

export function printHtmlDocument({ title, content, styles = defaultReceiptStyles }: PrintHtmlDocumentOptions) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.open()
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <base href="${window.location.origin}/" />
        <title>${escapeHtml(title)}</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="print-actions">
          <button class="print-button" type="button" onclick="window.print()">Print Document</button>
          <button class="close-button" type="button" onclick="window.close()">Close</button>
        </div>
        ${content}
      </body>
    </html>
  `)
  printWindow.document.close()

  const triggerPrint = () => {
    printWindow.focus()
    printWindow.print()
  }

  if (isIOSPrintContext()) {
    triggerPrint()
    return
  }

  const triggerPrintAfterImages = () => {
    const pendingImages = Array.from(printWindow.document.images).filter((image) => !image.complete)
    if (pendingImages.length === 0) {
      window.setTimeout(triggerPrint, 75)
      return
    }

    let didPrint = false
    const timeoutId = window.setTimeout(() => {
      didPrint = true
      triggerPrint()
    }, MAX_IMAGE_WAIT_MS)

    Promise.all(
      pendingImages.map((image) => new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }))
    ).then(() => {
      if (didPrint) return
      didPrint = true
      window.clearTimeout(timeoutId)
      triggerPrint()
    })
  }

  if (printWindow.document.readyState === 'complete') {
    triggerPrintAfterImages()
  } else {
    printWindow.addEventListener('load', triggerPrintAfterImages, { once: true })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { buildReportExportData, buildReportPdf, getReportExportFilename, type ReportExportCatalogType, type ReportExportPeriod } from '@/lib/reportExport'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const period = request.nextUrl.searchParams.get('period') as ReportExportPeriod | null
    const locationId = request.nextUrl.searchParams.get('locationId') || ''
    const catalogTypeParam = request.nextUrl.searchParams.get('catalogType')
    const catalogType: ReportExportCatalogType = catalogTypeParam === 'audio' || catalogTypeParam === 'watches'
      ? catalogTypeParam
      : 'all'

    if (!period || !['monthly', 'yearly'].includes(period)) {
      return NextResponse.json(
        { error: 'Provide a valid export period: monthly or yearly.' },
        { status: 400 }
      )
    }

    const data = await buildReportExportData(period, locationId, catalogType)

    const pdf = await buildReportPdf(data)
    const filename = getReportExportFilename(data)

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Report export error:', error)
    return NextResponse.json(
      { error: 'Failed to export report' },
      { status: 500 }
    )
  }
}
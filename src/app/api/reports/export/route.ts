import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { buildReportCsv, buildReportExportData, buildReportPdf, getReportExportFilename, type ReportExportFormat, type ReportExportPeriod } from '@/lib/reportExport'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const period = request.nextUrl.searchParams.get('period') as ReportExportPeriod | null
    const locationId = request.nextUrl.searchParams.get('locationId') || ''
    const format = (request.nextUrl.searchParams.get('format') || 'csv') as ReportExportFormat

    if (!period || !['monthly', 'yearly'].includes(period)) {
      return NextResponse.json(
        { error: 'Provide a valid export period: monthly or yearly.' },
        { status: 400 }
      )
    }

    if (!['csv', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: 'Provide a valid export format: csv or pdf.' },
        { status: 400 }
      )
    }

    const data = await buildReportExportData(period, locationId)

    if (format === 'pdf') {
      const pdf = await buildReportPdf(data)
      const filename = getReportExportFilename(data, 'pdf')

      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const csv = buildReportCsv(data)
    const filename = getReportExportFilename(data, 'csv')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
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
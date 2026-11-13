import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportLabel,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports payments as CSV. The whole matching set, never one page.
 *
 * `columns` and `scope` come from the client, so both are checked against an
 * allowlist here before anything reaches the serializer or the filename.
 * `scope=all` runs the same query builder with no filters.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const columns = parseExportColumns(params.get("columns"))
  if (!columns.ok) {
    return NextResponse.json({ error: columns.error }, { status: 400 })
  }

  const scope = parseExportScope(params.get("scope"))
  if (!scope) {
    return NextResponse.json(
      { error: "Scope must be 'filter' or 'all'." },
      { status: 400 },
    )
  }

  const parsed = parseFilters(params)
  const filters =
    scope === "all"
      ? { sort: parsed.sort, direction: parsed.direction }
      : parsed
  const rows = sortPayments(
    filterPayments(filters),
    filters.sort,
    filters.direction,
  )
  const filename = exportFilename(new Date(), exportLabel(scope, filters))

  return new Response(toCsv(rows, columns.columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}

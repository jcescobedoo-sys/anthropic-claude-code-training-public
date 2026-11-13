import { merchantById } from "@/data/merchants"
import { Payment } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). The card last four is
 * opt-in: files often go to merchants, so it is never in the default set.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** What an export contains when the client does not say. No card last four. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

export const EXPORT_SCOPES = ["filter", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

export type ParsedColumns =
  | { ok: true; columns: ExportColumn[] }
  | { ok: false; error: string }

/**
 * Validate the `columns` query param against the allowlist.
 *
 * Missing → the default set. Present → comma-separated names, kept in the
 * order given, duplicates dropped. Any unknown name rejects the whole
 * request, and an empty selection is an error rather than an empty file.
 */
export function parseExportColumns(param: string | null): ParsedColumns {
  if (param === null) return { ok: true, columns: [...DEFAULT_EXPORT_COLUMNS] }

  const requested = param
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  if (requested.length === 0) {
    return { ok: false, error: "Choose at least one column to export." }
  }

  const unknown = requested.filter(
    (name) => !EXPORT_COLUMNS.includes(name as ExportColumn),
  )
  if (unknown.length > 0) {
    return { ok: false, error: "Unknown export column requested." }
  }

  return { ok: true, columns: [...new Set(requested as ExportColumn[])] }
}

export function parseExportScope(param: string | null): ExportScope | null {
  if (param === null) return "filter"
  return EXPORT_SCOPES.includes(param as ExportScope)
    ? (param as ExportScope)
    : null
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/**
 * `payments-<label>-<YYYY-MM-DD>.csv`, date in UTC. The label must come from
 * an allowlist (scope or a parsed status), never from raw client input.
 */
export function exportFilename(date = new Date(), label?: string): string {
  const day = date.toISOString().slice(0, 10)
  return label ? `payments-${label}-${day}.csv` : `payments-${day}.csv`
}

/** The filename label for an export, from validated values only. */
export function exportLabel(
  scope: ExportScope,
  filters: { status?: string; merchantId?: string; search?: string },
): string {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  if (filters.merchantId || filters.search) return "filtered"
  return "all"
}

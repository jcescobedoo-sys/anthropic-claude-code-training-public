# SPEC · NWP-101 — Payments export: choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** JC
**Status:** draft

## Problem

Ops exports payments several times a day for merchants, month-end reconciliation and Finance. Every file carries every column, card last-four included, so anything sent to a merchant is cleaned by hand: 3–4 hours a month, plus a near-miss where an unedited file almost went to the wrong merchant.

## Current state

All paths are relative to `build-battle/merchant-console/`.

- `src/app/api/payments/export/route.ts` — `GET` runs `parseFilters` → `filterPayments` → `sortPayments` → `toCsv(rows)`, with no pagination, so the whole filtered set is exported. Columns and scope are fixed. The filename is `exportFilename()`, which has no scope in it.
- `src/lib/csv.ts` — `EXPORT_COLUMNS` (10 columns, `last4` included), `ExportColumn` type, `toCsv(payments, columns = EXPORT_COLUMNS)`, `exportFilename(date)` → `payments-YYYY-MM-DD.csv`. **`toCsv` already takes a column list and honours its order**, so the serializer needs no rewrite.
- `src/lib/csv.test.ts` — 9 tests. One already covers "only the requested columns, in the order given". The file header says these must still pass after NWP-101, which pins `toCsv`'s default to all 10 columns.
- `src/data/queries.ts` — `parseFilters` (allowlist for status/sort/direction), `filterPayments`, `sortPayments`, `queryPayments` (returns `total`). This is the one query builder.
- `src/app/payments/page.tsx` — Server Component. Export is a plain `<a href="/api/payments/export?…">`, with no dialog. **It builds filters by hand with its own `STATUSES` copy instead of calling `parseFilters`**. It ignores `from`/`to`/`sort`, but forwards them to the export, so the table and the export can disagree.
- `src/components/Drawer.tsx` — Radix Dialog with an accessible title, a focus trap, Escape to close, and header/body/footer slots.
- **Doc vs code:** `.claude/rules/components.md` says `src/components/` has a Dialog. It does not. Drawer is the only Radix dialog. There is no Checkbox or RadioGroup component either.
- **Bug found, not in scope:** `sortPayments` sorts amounts as strings (`localeCompare`), so `sort=amount` exports in the wrong order ("9000" sorts after "25000").

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Column names arrive from the client, so validate them server-side" | ticket | Arbitrary input reaches the serializer and the filename |
| "Validate everything from the client against an allowlist before it reaches the store, a query, or a filename" | `.claude/rules/api-routes.md` | Header/filename injection |
| "Reuse the query builder… Writing a second filter path is a defect" | `api-routes.md`, ticket | Export and table disagree |
| "Building this in the browser exports the current page only" | ticket | Ships 20 rows instead of the set |
| "Amounts are integer minor units… Format at the edge" | `.claude/rules/money.md` | Float drift; double formatting |
| "Dialogs and forms must be operable: every input has a label, accessible name, focus returns, Escape closes" | `.claude/rules/components.md` | Fails a11y review |
| "Reject early and return… same error shape everywhere" | `api-routes.md` | Silent empty files |

## Approach

Keep the CSV built on the server. Extend the existing export route with two allowlisted params: `columns` (comma-separated `ExportColumn` names, in order) and `scope` (`filter` | `all`, default `filter`). A new `parseExportColumns` in `src/lib/csv.ts` sits beside `EXPORT_COLUMNS` and works as follows:
- **Missing param:** returns `DEFAULT_EXPORT_COLUMNS` (every column except `last4`).
- **Valid list:** dedupes and keeps the requested order.
- **Unknown name:** the route answers 400.
- **Empty list:** the route answers 400 instead of sending an empty file.

`scope=all` runs the same builder with empty filters. `exportFilename` gains an optional scope label (`payments-disputed-2026-08-13.csv`, `payments-all-…`). The page swaps its hand-rolled filters for `parseFilters`, computes both row counts with `queryPayments`, and passes them to a new client `ExportDialog`. The dialog is built on Drawer with native labelled checkboxes and radios. Download is disabled at zero columns.

**Considered and rejected:**
- **Build the CSV in the browser from the table rows.** Exports only the current page, which the ticket calls out.
- **Change `toCsv`'s default to drop `last4`.** That breaks the pinned header test, and the default belongs at the request boundary, not in the serializer.
- **A new Dialog component.** Drawer already gives the Radix behaviour, and a second dialog primitive is duplication.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | `DEFAULT_EXPORT_COLUMNS`, `parseExportColumns`, `EXPORT_SCOPES`, scope label in `exportFilename` |
| `src/app/api/payments/export/route.ts` | change | Validate `columns`/`scope`, 400 on bad or empty input, scoped filename |
| `src/app/payments/page.tsx` | change | Use `parseFilters`, compute both counts, render the dialog |
| `src/app/payments/export-dialog.tsx` | add | Client dialog: columns, scope, row count, Download |
| `src/lib/csv.test.ts` | change | Tests for column selection, defaults, empty, unknown, filename |

## Plan

1. **Baseline:** run `npm test`. Done when it reports 28 passing.
2. **Serializer and validation in `csv.ts`.** Done when `npx tsc --noEmit` is clean and the existing 9 csv tests still pass.
3. **Route handler.** Done when `curl` shows:
   - no `columns` param → a header without `last4`;
   - `columns=amount,id` → header `amount,id`;
   - `columns=` or `columns=pan` → 400 with a JSON message;
   - `scope=all` → one data row per seeded payment (≈1,680; the seed draws 9–19 a day) and `payments-all-<date>.csv`;
   - `status=disputed` → `payments-disputed-<date>.csv`.
4. **Page and dialog.** Done when, in the browser, Export opens the dialog:
   - `last4` is unchecked, current filter is selected, and the count matches the table footer;
   - switching to all payments shows the full store count;
   - unchecking every box disables Download;
   - Escape closes the dialog and returns focus.
5. **Tests.** In `csv.test.ts`, cover:
   - a subset of columns in the requested order;
   - `last4` excluded by default;
   - empty selection;
   - unknown names rejected;
   - duplicates collapsed;
   - scoped filename.

   Done when `npm test` passes.
6. **Ship.** Run `/ship-ready`, then commit as `NWP-101: …`, then write the PR with `/pr`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Choose columns; last-four off by default | `parseExportColumns` default test; dialog opens with last-four unchecked; `curl` with no `columns` has no `last4` |
| Scope current/all, default current, count visible | Dialog shows `queryPayments(...).total` for both; `curl scope=all` data rows equal the dialog's all-payments count |
| Filename reflects scope and date | `exportFilename` test; `content-disposition` header in `curl -I` |
| Minor units, formatted once, currency own column | Unchanged `cell()` path via `formatMoney`; existing amount tests still pass |
| Zero columns disables Download | Dialog check in the browser; server 400 for `columns=`, backed by the empty-selection test |

## Risks

- **A filename built from client input.** The label only comes from allowlisted values (`scope`, `status` after `parseFilters`), never from raw `search` or `merchantId`.
- **Switching `page.tsx` to `parseFilters`** starts honouring `from`/`to`/`sort` on the table. That is the intended single source of truth, but the visible order can change if someone has `sort=` in the URL.
- **Counts are computed at render time.** They match the export unless data changes between render and click, which can't happen with the in-memory seed.

## Out of scope

- The amount-sort string bug in `sortPayments`: logged for a separate fix.
- Persisting column preferences per user.
- Merchant name in the filename.
- Any database or pagination change (NWP-203).

## Open questions

- When the current filter is merchant or search only (no status), the label is `filtered`, e.g. `payments-filtered-2026-08-13.csv`. Acceptable, or should it name the merchant?

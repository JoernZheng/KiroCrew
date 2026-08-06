/**
 * Sessions — the Processes plane of the System page.
 *
 * Shaped after Task Manager's Processes tab, and deliberately not after its own
 * earlier shape: a resource is a COLUMN, never a mode. Task Manager shows CPU,
 * Memory, Disk and Network side by side and lets you pick a focus by SORTING,
 * with a Columns menu to hide what you do not care about. Switching "views" to
 * swap column sets was an invention, and it leaked — the Memory view still
 * carried a CPU column, because a row genuinely has both.
 *
 * `Group by` is the orthogonal axis: it folds rows on an ATTRIBUTE of the
 * session (agent, channel), which is why an app will slot in as another value
 * rather than another tab once sessions carry an app attribute.
 *
 * Sorting, expansion, grouping and aggregation come from `@tanstack/react-table`
 * and the markup from `components/ui/table`, so nothing here re-implements a
 * grid.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,

  type GroupingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ChevronDown, ChevronRight, ChevronUp, MemoryStick, Columns3 } from 'lucide-react'
import { api } from '../../api/client'
import { Btn, Card, CardTitle, EmptyState, IconButton, SearchInput } from '../../components/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import InfoTip from '../../components/InfoTip'
import SegmentedControl, { type Segment } from '../../components/SegmentedControl'
import { fmtNumber, fmtPercent } from '../../i18n/format'
import {
  buildTree,
  columnMaxima,
  fmtGb,
  fmtHostPct,
  fmtMb,
  fmtUptime,
  heatLevel,
  sparklineBars,
  type SessionRow,
} from './sessionRows'

import { i18nT } from '../../i18n/t'

type Payload = Awaited<ReturnType<typeof api.sessionsMemory>>

/** Attribute the table folds on. `none` is a flat ranking, Task Manager's default. */
export type GroupBy = 'none' | 'agent' | 'channel'

/** Grouping state for a fold choice. `none` groups on nothing at all. */
export function groupingFor(by: GroupBy): GroupingState {
  return by === 'none' ? [] : [by]
}

const NUM = 'text-right font-mono text-[12.5px] tabular-nums whitespace-nowrap'
const HEAT = ['', 'bg-accent/[0.05]', 'bg-accent/[0.11]', 'bg-accent/[0.18]'] as const

const helper = createColumnHelper<SessionRow>()

/**
 * Heat tint as a class, from a cell value and its column's maximum.
 *
 * Task Manager's own device: it ranks at a glance without spending a second
 * colour dimension, which is why the rows carry no per-row bar.
 */
export function heatClass(value: number | null, max: number | null): string {
  return HEAT[heatLevel(value, max)]
}

export default function SessionsTab() {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'rssMb', desc: true }])
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [filter, setFilter] = useState('')
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data } = useQuery<Payload>({
    queryKey: ['sessionsMemory'],
    queryFn: () => api.sessionsMemory(),
    refetchInterval: 5000,
  })

  const sessions = data?.sessions ?? []
  const tasks = data?.tasks ?? []
  const totals = data?.totals
  const hostMb = totals?.host_mb ?? null
  const rows = useMemo(() => buildTree(sessions, tasks), [sessions, tasks])
  const maxima = useMemo(() => columnMaxima(rows), [rows])

  // Deliberately un-annotated: each accessor column has its own value type, so
  // a single `ColumnDef<SessionRow, T>[]` annotation cannot describe the array
  // without collapsing to `any`. Inference keeps every cell callback typed.
  const columns = useMemo(
    () => [
        helper.accessor('name', {
          header: i18nT('pages.sessionsTab.session_task'),
          enableHiding: false,
          enableGrouping: false,
        }),
        helper.accessor('rssMb', {
          header: i18nT('pages.sessionsTab.memory'),
          enableGrouping: false,
          // Aggregated so a fold reports the sum of its members rather than a
          // blank cell — a group header with no number is the one thing that
          // makes grouping useless.
          aggregationFn: 'sum',
          cell: c => fmtMb(c.getValue<number | null>()),
        }),
        helper.accessor('rssMb', {
          id: 'share',
          header: i18nT('pages.sessionsTab.host_share'),
          enableGrouping: false,
          aggregationFn: 'sum',
          cell: c => fmtHostPct(c.getValue<number | null>(), hostMb),
        }),
        helper.accessor('peakMb', {
          header: i18nT('pages.sessionsTab.peak'),
          enableGrouping: false,
          aggregationFn: 'max',
          cell: c => fmtMb(c.getValue<number | null>()),
        }),
        helper.accessor('cpuCores', {
          header: i18nT('pages.sessionsTab.cpu'),
          enableGrouping: false,
          aggregationFn: 'sum',
          cell: c => {
            const v = c.getValue<number | null>()
            return v == null ? '—' : fmtNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          },
        }),
        helper.accessor('procs', {
          header: i18nT('pages.sessionsTab.proc'),
          enableGrouping: false,
          aggregationFn: 'sum',
          cell: c => {
            const v = c.getValue<number | null>()
            return v == null ? '—' : fmtNumber(v)
          },
        }),
        helper.accessor('mcp', {
          header: i18nT('pages.sessionsTab.stubs'),
          enableGrouping: false,
          aggregationFn: 'sum',
          cell: c => {
            const v = c.getValue<number | null>()
            return v == null ? '—' : fmtNumber(v)
          },
        }),
        helper.accessor('uptimeS', {
          header: i18nT('pages.sessionsTab.uptime'),
          enableGrouping: false,
          aggregationFn: 'max',
          cell: c => fmtUptime(c.getValue<number | null>()),
        }),
        helper.accessor('agent', { header: i18nT('pages.sessionsTab.agent') }),
        helper.accessor('channel', { header: i18nT('pages.sessionsTab.channel') }),
        helper.accessor('pid', {
          header: i18nT('pages.sessionsTab.pid'),
          enableGrouping: false,
          // A pid is an identifier, not a quantity: locale grouping would render
          // 4066648 as "4,066,648" and break copy-paste into ps/kill.
          cell: c => {
            const v = c.getValue<number | null>()
            return v == null ? '—' : String(v)
          },
        }),
    ],
    [hostMb],
  )
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, grouping: groupingFor(groupBy), globalFilter: filter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getSubRows: row => row.subRows,
    getRowId: row => `${row.kind}:${row.id}`,
    // Filtering matches the row's own text only; TanStack keeps a parent whose
    // child matches, which is what you want when filtering a task by name.
    globalFilterFn: (row, _col, value: string) => {
      const needle = String(value ?? '').trim().toLowerCase()
      if (!needle) return true
      const r = row.original
      return r.name.toLowerCase().includes(needle) || r.agent.toLowerCase().includes(needle)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    // Rows arrive expanded: a collapsed tree hides the tasks that are the
    // reason a session is large.
    initialState: { expanded: true },
  })

  const usedMb = totals?.rss_mb ?? 0
  const largestMb = sessions.reduce<number | null>(
    (m, s) => (s.rss_mb != null && (m == null || s.rss_mb > m) ? s.rss_mb : m),
    null,
  )
  const procTotal = sessions.reduce((n, s) => n + (s.procs ?? 0), 0)
  const bars = sparklineBars(data?.history ?? [], hostMb)
  const groupSegments: Array<Segment<GroupBy>> = [
    { key: 'none', label: i18nT('pages.sessionsTab.group_none') },
    { key: 'agent', label: i18nT('pages.sessionsTab.group_agent') },
    { key: 'channel', label: i18nT('pages.sessionsTab.group_channel') },
  ]
  const hideable = table.getAllLeafColumns().filter(c => c.getCanHide())

  return (
    <Card className="mb-6">
      <CardTitle>
        {i18nT('pages.sessionsTab.sessions')}
        <InfoTip text={i18nT('pages.sessionsTab.resident_memory_of_each_session_s_whole_process')} />
        <span className="ml-auto text-[12px] text-muted font-mono tabular-nums font-normal">
          {fmtMb(totals?.rss_mb ?? null)}
          {hostMb ? ` / ${fmtMb(hostMb)}` : ''}
          {totals?.host_pct != null ? ` · ${fmtPercent(totals.host_pct / 100, { maximumFractionDigits: 2 })}` : ''}
        </span>
      </CardTitle>

      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-muted">{i18nT('pages.sessionsTab.group_by')}</span>
        {/* collapse=false: this sits inside a .card-glow Card, where
            `> * { z-index: 1 }` traps the dropdown overlay under the rows. */}
        <SegmentedControl<GroupBy> segments={groupSegments} value={groupBy} onChange={setGroupBy} collapse={false} />
        <SearchInput
          placeholder={i18nT('pages.sessionsTab.filter_sessions')}
          value={filter}
          onChange={e => setFilter(e.currentTarget.value)}
          className="ml-auto w-full sm:w-52"
        />
        <div className="relative">
          <Btn
            type="button"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen(o => !o)}
            className="text-[11.5px] gap-1.5"
          >
            <Columns3 size={13} aria-hidden="true" className="lucide-inline" />
            {i18nT('pages.sessionsTab.columns')}
          </Btn>
          {pickerOpen && (
            <div className="absolute right-0 z-20 mt-1 min-w-40 rounded border border-border bg-bg-elevated p-1.5 shadow-lg">
              {hideable.map(col => (
                <label key={col.id} className="flex items-center gap-2 px-1.5 py-1 text-[12px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  {flexRender(col.columnDef.header, {} as never) as never}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {table.getRowModel().rows.length === 0 ? (
        <EmptyState
          icon={<MemoryStick className="lucide-inline" />}
          title={i18nT('pages.sessionsTab.no_active_sessions')}
        />
      ) : (
        <Table className="table-striped">
          <TableHeader>
            <TableRow className="bg-bg-elevated">
              {table.getHeaderGroups()[0]?.headers.map(h => {
                const first = h.column.id === 'name'
                const dir = h.column.getIsSorted()
                return (
                  <TableHead
                    key={h.id}
                    aria-sort={dir === 'desc' ? 'descending' : dir === 'asc' ? 'ascending' : 'none'}
                    className={`px-3 py-1.5 text-[11px] font-medium ${first ? 'text-left' : 'text-right'}`}
                  >
                    {/* Re-sorting is THE interaction on a task-manager table, so
                        every header is a button. `Btn`'s box is stripped: a boxed
                        control in every head would read as an action. */}
                    <Btn
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className={`border-transparent bg-transparent px-0 py-0 gap-1 text-[11px] font-medium ${
                        dir ? 'text-accent' : 'text-muted'
                      }`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir === 'desc' && <ChevronDown size={12} aria-hidden="true" className="lucide-inline" />}
                      {dir === 'asc' && <ChevronUp size={12} aria-hidden="true" className="lucide-inline" />}
                    </Btn>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => {
              const r = row.original
              const grouped = row.getIsGrouped()
              const href = grouped ? null : r.href
              return (
                <TableRow
                  key={row.id}
                  className={`${grouped ? 'bg-bg-elevated' : ''} ${href ? 'cursor-pointer hover:bg-bg-hover' : ''}`}
                  {...(href ? { onClick: () => navigate(href) } : {})}
                >
                  {row.getVisibleCells().map(cell => {
                    const isName = cell.column.id === 'name'
                    const heat =
                      cell.column.id === 'rssMb'
                        ? heatClass(r.rssMb, maxima.rssMb)
                        : cell.column.id === 'cpuCores'
                          ? heatClass(r.cpuCores, maxima.cpuCores)
                          : ''
                    if (cell.getIsPlaceholder()) return <TableCell key={cell.id} className={NUM} />
                    return (
                      <TableCell
                        key={cell.id}
                        className={
                          isName
                            ? `px-3 py-1.5 text-left text-[12.5px] max-w-[330px] truncate ${
                                row.depth > 0 ? 'pl-9 text-text' : 'text-text-strong font-medium'
                              }`
                            : `px-3 py-1.5 ${NUM} ${heat}`
                        }
                        {...(isName ? { title: grouped ? String(cell.getValue() ?? '') : r.name } : {})}
                      >
                        {isName ? (
                          <>
                            {/* Two SIBLING controls, never nested: a row-level
                                click stays a mouse convenience, but the keyboard
                                and screen-reader path lives on these. */}
                            {row.getCanExpand() && (
                              <IconButton
                                aria-expanded={row.getIsExpanded()}
                                aria-label={i18nT(
                                  row.getIsExpanded()
                                    ? 'pages.sessionsTab.collapse_tasks'
                                    : 'pages.sessionsTab.expand_tasks',
                                  { name: r.name },
                                )}
                                onClick={e => {
                                  e.stopPropagation()
                                  row.toggleExpanded()
                                }}
                                className="inline-block w-3 -ml-3 mr-0.5 p-0 align-middle text-muted hover:text-text"
                              >
                                {row.getIsExpanded() ? (
                                  <ChevronDown size={12} aria-hidden="true" className="lucide-inline" />
                                ) : (
                                  <ChevronRight size={12} aria-hidden="true" className="lucide-inline" />
                                )}
                              </IconButton>
                            )}
                            {href ? (
                              <Btn
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  navigate(href)
                                }}
                                className="border-transparent bg-transparent px-0 py-0 text-left text-inherit font-inherit hover:underline"
                              >
                                {r.name}
                              </Btn>
                            ) : (
                              flexRender(cell.column.columnDef.cell, cell.getContext())
                            )}
                            {grouped && (
                              <span className="ml-2 text-[10.5px] text-muted font-mono">
                                {fmtNumber(row.subRows.length)}
                              </span>
                            )}
                            {r.shared && !grouped && (
                              <span className="ml-1.5 text-[10px] px-1.5 rounded border border-warn/40 text-warn align-[1px]">
                                {i18nT('pages.sessionsTab.shared')}
                              </span>
                            )}
                          </>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Session-scoped totals only. Host-scale numbers (physical memory, free
          memory) belong to the Performance plane, and carrying them here made
          the same quantity appear twice under two different names. */}
      <div className="mt-3 pt-3 border-t border-border grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[11.5px] text-muted">{i18nT('pages.sessionsTab.memory_load')}</span>
            <span className="text-[12.5px] font-mono tabular-nums text-accent">
              {totals?.host_pct != null ? fmtPercent(totals.host_pct / 100, { maximumFractionDigits: 1 }) : '—'}
            </span>
          </div>
          {bars.length > 0 ? (
            <div className="h-12 flex items-end gap-px" aria-hidden="true">
              {bars.map((pct, i) => (
                <div
                  key={i}
                  className="flex-1 bg-accent/60 rounded-t-[1px] min-h-[2px]"
                  style={{ height: `${pct}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="h-12 flex items-center text-[11.5px] text-muted">
              {i18nT('pages.sessionsTab.collecting_samples')}
            </div>
          )}
        </div>
        <div className="grid gap-1 content-start justify-items-end">
          <Stat label={i18nT('pages.sessionsTab.kirocrew_used')} value={fmtGb(usedMb)} />
          <Stat label={i18nT('pages.sessionsTab.largest_session')} value={fmtGb(largestMb)} />
          <Stat label={i18nT('pages.sessionsTab.sessions_count')} value={fmtNumber(sessions.length)} />
          <Stat label={i18nT('pages.sessionsTab.tasks_running')} value={fmtNumber(tasks.length)} />
          <Stat label={i18nT('pages.sessionsTab.session_procs')} value={fmtNumber(procTotal)} />
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11.5px] text-muted whitespace-nowrap">{label}</span>
      <span className="text-[12.5px] font-mono tabular-nums text-text-strong">{value}</span>
    </div>
  )
}

/**
 * Performance — the resource-monitoring plane of the System page.
 *
 * Shaped after Task Manager's Performance tab: a left rail selects one resource
 * at a time, a right body shows a large live graph plus that resource's numbers.
 * No process/session table — that belongs to Sessions.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { Card } from '../../components/ui'
import { fmtNumber, fmtPercent, fmtUnit } from '../../i18n/format'
import { i18nT } from '../../i18n/t'
import type { SystemData } from '../../types'

type Resource = 'cpu' | 'memory' | 'disk' | 'network'

/** Rolling history length — ~60s at 2s poll interval. */
const HISTORY_LEN = 30

interface HistoryPoint {
  cpu: number
  mem: number
  disk: number
  netRx: number
  netTx: number
}

/** Headline value shown on the left rail tile for each resource. */
function headline(d: SystemData | null, resource: Resource): string {
  if (!d) return '—'
  switch (resource) {
    case 'cpu': return fmtPercent(d.cpu_pct / 100)
    case 'memory': return fmtPercent(d.mem_used_gb / (d.mem_total_gb || 1))
    case 'disk': {
      const used = d.disk_total_gb - d.disk_free_gb
      return fmtPercent(used / (d.disk_total_gb || 1))
    }
    case 'network': return fmtUnit(d.net_rx_kbs + d.net_tx_kbs, 'kilobyte-per-second', { maximumFractionDigits: 0 })
  }
}

/** Map resource to the history value used for its graph (0–100 scale for cpu/mem/disk). */
function graphValue(pt: HistoryPoint, resource: Resource): number {
  switch (resource) {
    case 'cpu': return pt.cpu
    case 'memory': return pt.mem
    case 'disk': return pt.disk
    case 'network': return pt.netRx + pt.netTx
  }
}

/**
 * Resource labels as a FUNCTION, not a module-level constant: a constant is
 * evaluated once at import and would freeze whichever language was active at
 * boot, leaving the rail untranslated after a language switch. Spelling the four
 * keys out also keeps them static literals, which is what the i18n key-reference
 * gate can verify — a template key cannot be checked against the catalogs.
 */
function resourceLabels(): Record<Resource, string> {
  return {
    cpu: i18nT('pages.performanceTab.resource_cpu'),
    memory: i18nT('pages.performanceTab.resource_memory'),
    disk: i18nT('pages.performanceTab.resource_disk'),
    network: i18nT('pages.performanceTab.resource_network'),
  }
}

export default function PerformanceTab() {
  const [selected, setSelected] = useState<Resource>('cpu')
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const lastDataId = useRef<number>(0)

  const { data } = useQuery<SystemData>({
    queryKey: ['system'],
    queryFn: () => api.system(),
    refetchInterval: 2000,
  })

  // Accumulate history on each new data fetch. dataUpdatedAt from the query
  // increments on each successful fetch, serving as a change signal.
  useEffect(() => {
    if (!data) return
    const id = Date.now()
    if (id === lastDataId.current) return
    lastDataId.current = id
    const point: HistoryPoint = {
      cpu: data.cpu_pct,
      mem: data.mem_total_gb > 0 ? (data.mem_used_gb / data.mem_total_gb) * 100 : 0,
      disk: data.disk_total_gb > 0 ? ((data.disk_total_gb - data.disk_free_gb) / data.disk_total_gb) * 100 : 0,
      netRx: data.net_rx_kbs,
      netTx: data.net_tx_kbs,
    }
    setHistory(prev => {
      const next = [...prev, point]
      return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next
    })
  }, [data])

  const d = data ?? null
  const resources: Resource[] = ['cpu', 'memory', 'disk', 'network']
  const labels = resourceLabels()

  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '196px minmax(0, 1fr)', gap: '1rem' }}>
        {/* Left rail — resource selector tiles */}
        <nav className="flex flex-col gap-1.5" aria-label={i18nT('pages.performanceTab.resource_nav')}>
          {resources.map(r => (
            <button
              key={r}
              type="button"
              aria-pressed={selected === r}
              onClick={() => setSelected(r)}
              className={`text-left rounded-md border px-3 py-2.5 transition-all ${
                selected === r
                  ? 'border-accent bg-bg-elevated shadow-sm'
                  : 'border-border bg-card hover:border-border-strong hover:bg-bg-hover'
              }`}
            >
              <div className="text-[12px] font-semibold text-text-strong">
                {labels[r]}
              </div>
              <div className="text-[11px] text-muted font-mono tabular-nums mt-0.5">
                {headline(d, r)}
              </div>
              <MiniSparkline history={history} resource={r} />
            </button>
          ))}
        </nav>

        {/* Right body — graph + stats */}
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <h3 className="text-sm font-semibold text-text-strong">
              {labels[selected]}
            </h3>
            <p className="text-[11.5px] text-muted mt-0.5">
              <ResourceSubtitle d={d} resource={selected} />
            </p>
          </div>

          {/* Large graph */}
          <div className="relative h-36 border border-border rounded bg-bg-elevated overflow-hidden">
            <LargeGraph history={history} resource={selected} />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 lg:grid-cols-3">
            <ResourceStats d={d} resource={selected} />
          </div>

          {/* Machine identity strip */}
          <div className="border-t border-border pt-3 mt-auto flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-muted">
            <span>{i18nT('pages.performanceTab.hostname')}: <strong className="text-text font-mono">{d?.hostname ?? '—'}</strong></span>
            <span>{i18nT('pages.performanceTab.os')}: <strong className="text-text font-mono">{d?.os ?? '—'}</strong></span>
            <span>{i18nT('pages.performanceTab.python')}: <strong className="text-text font-mono">{d?.python ?? '—'}</strong></span>
            <span>{i18nT('pages.performanceTab.live_checkout')}: <strong className="text-text font-mono text-[11px] break-all">{d?.cwd ?? '—'}</strong></span>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ── Mini sparkline for the left rail tiles ── */

function MiniSparkline({ history, resource }: { history: HistoryPoint[]; resource: Resource }) {
  if (history.length < 2) return null
  const values = history.map(pt => graphValue(pt, resource))
  const max = resource === 'network' ? Math.max(...values, 1) : 100
  const bars = values.map(v => Math.max(2, (v / max) * 100))

  return (
    <div className="flex items-end gap-px h-4 mt-1.5" aria-hidden="true">
      {bars.map((pct, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/50 rounded-t-[1px] min-h-[2px]"
          style={{ height: `${pct}%` }}
        />
      ))}
    </div>
  )
}

/* ── Large graph (bar-based, no SVG) ── */

function LargeGraph({ history, resource }: { history: HistoryPoint[]; resource: Resource }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-[11.5px] text-muted">
        {i18nT('pages.performanceTab.collecting_samples')}
      </div>
    )
  }

  const values = history.map(pt => graphValue(pt, resource))
  const max = resource === 'network' ? Math.max(...values, 1) : 100
  const bars = values.map(v => Math.max(1, (v / max) * 100))

  return (
    <div className="absolute inset-0 flex items-end gap-px px-1 pb-1 pt-1">
      {bars.map((pct, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/60 rounded-t-[1px] transition-[height] duration-200"
          style={{ height: `${pct}%` }}
        />
      ))}
    </div>
  )
}

/* ── Subtitle (static facts about the selected resource) ── */

function ResourceSubtitle({ d, resource }: { d: SystemData | null; resource: Resource }) {
  if (!d) return <>{'—'}</>
  // One interpolated string per resource rather than a label glued onto a
  // number: word order after a quantity is not the same in every language, and
  // a fragment translated alone has no grammatical context to translate into.
  switch (resource) {
    case 'cpu':
      return (
        <>
          {i18nT('pages.performanceTab.cpu_subtitle', { arch: d.arch, count: fmtNumber(d.cpu_count) })}
        </>
      )
    case 'memory':
      return (
        <>
          {i18nT('pages.performanceTab.memory_subtitle', {
            size: fmtUnit(d.mem_total_gb, 'gigabyte', { maximumFractionDigits: 1 }),
          })}
        </>
      )
    case 'disk':
      return (
        <>
          {i18nT('pages.performanceTab.disk_subtitle', {
            size: fmtUnit(d.disk_total_gb, 'gigabyte', { maximumFractionDigits: 0 }),
          })}
        </>
      )
    case 'network':
      return <>{d.ip}</>
  }
}

/* ── Per-resource stats ── */

function ResourceStats({ d, resource }: { d: SystemData | null; resource: Resource }) {
  if (!d) return null
  switch (resource) {
    case 'cpu':
      return (
        <>
          <Stat label={i18nT('pages.performanceTab.utilization')} value={fmtPercent(d.cpu_pct / 100)} />
          <Stat label={i18nT('pages.performanceTab.gateway_cpu')} value={fmtPercent(d.proc_cpu_pct / 100)} />
          <Stat label={i18nT('pages.performanceTab.cores')} value={fmtNumber(d.cpu_count)} />
          <Stat label={i18nT('pages.performanceTab.load_1m')} value={fmtNumber(d.load_1m, { maximumFractionDigits: 2 })} />
          <Stat label={i18nT('pages.performanceTab.load_5m')} value={fmtNumber(d.load_5m, { maximumFractionDigits: 2 })} />
          <Stat label={i18nT('pages.performanceTab.load_15m')} value={fmtNumber(d.load_15m, { maximumFractionDigits: 2 })} />
          <Stat label={i18nT('pages.performanceTab.threads')} value={fmtNumber(d.thread_count)} />
          <Stat label={i18nT('pages.performanceTab.processes_mcp')} value={fmtNumber(d.mcp_total ?? 0)} />
          {d.mcp_processes && (
            <>
              <Stat label={i18nT('pages.performanceTab.sandbox_procs')} value={fmtNumber(d.mcp_processes.sandbox)} />
              <Stat label={i18nT('pages.performanceTab.kiro_cli_procs')} value={fmtNumber(d.mcp_processes.kiro_cli)} />
              <Stat label={i18nT('pages.performanceTab.builder_mcp_procs')} value={fmtNumber(d.mcp_processes.builder_mcp)} />
            </>
          )}
          {/* child_processes excluded: reads /proc/<pid>/task (threads), contradicts thread_count */}
        </>
      )
    case 'memory':
      return (
        <>
          <Stat label={i18nT('pages.performanceTab.total')} value={fmtUnit(d.mem_total_gb, 'gigabyte', { maximumFractionDigits: 1 })} />
          <Stat label={i18nT('pages.performanceTab.used')} value={fmtUnit(d.mem_used_gb, 'gigabyte', { maximumFractionDigits: 1 })} />
          <Stat label={i18nT('pages.performanceTab.free')} value={fmtUnit(d.mem_free_gb, 'gigabyte', { maximumFractionDigits: 1 })} />
          <Stat label={i18nT('pages.performanceTab.gateway_rss')} value={fmtUnit(d.proc_mem_mb, 'megabyte', { maximumFractionDigits: 0 })} />
        </>
      )
    case 'disk':
      return (
        <>
          <Stat label={i18nT('pages.performanceTab.total')} value={fmtUnit(d.disk_total_gb, 'gigabyte', { maximumFractionDigits: 0 })} />
          <Stat label={i18nT('pages.performanceTab.free')} value={fmtUnit(d.disk_free_gb, 'gigabyte', { maximumFractionDigits: 0 })} />
          <Stat
            label={i18nT('pages.performanceTab.used_pct')}
            value={fmtPercent((d.disk_total_gb - d.disk_free_gb) / (d.disk_total_gb || 1))}
          />
        </>
      )
    case 'network':
      return (
        <>
          <Stat label={i18nT('pages.performanceTab.ip_address')} value={d.ip} />
          <Stat label={i18nT('pages.performanceTab.download')} value={fmtUnit(d.net_rx_kbs, 'kilobyte-per-second', { maximumFractionDigits: 0 })} />
          <Stat label={i18nT('pages.performanceTab.upload')} value={fmtUnit(d.net_tx_kbs, 'kilobyte-per-second', { maximumFractionDigits: 0 })} />
        </>
      )
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-[11.5px] text-muted whitespace-nowrap">{label}</span>
      <span className="text-[12.5px] font-mono tabular-nums text-text-strong">{value}</span>
    </div>
  )
}

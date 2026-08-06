/**
 * System — a task manager for this install, in Windows 11's shape.
 *
 * Three planes, because the questions they answer are different in kind and mixing
 * them is what made a single flat page unreadable:
 *
 *   Sessions     which session is spending what, right now. One table; every
 *                resource is a COLUMN, focused by sorting, never a view mode.
 *   Performance  how the machine as a whole is doing. Pick a resource, get one
 *                graph and that resource's own numbers. No per-session rows.
 *   Services     the long-lived things that serve sessions without being one:
 *                the gateway process, the shared MCP gateway, embeddings, Slack,
 *                governance.
 *
 * The App-history plane deliberately does NOT live here. Cumulative spend is the
 * Telemetry page's Spend tab, and duplicating it would put the same numbers on
 * two surfaces with two different windows.
 */
import { useState } from 'react'
import { Activity, Cpu, Server } from 'lucide-react'
import { PageHeader } from '../components/ui'
import SegmentedControl, { type Segment } from '../components/SegmentedControl'
import SessionsTab from './system/SessionsTab'
import PerformanceTab from './system/PerformanceTab'
import ServicesTab from './system/ServicesTab'

import { i18nT } from '../i18n/t'

export type SystemPlane = 'sessions' | 'performance' | 'services'

/**
 * A FUNCTION, not a module-level array: the labels are translated, and a
 * module-level constant is evaluated once at import — which would freeze
 * whichever language was active at boot and leave the rail stale after a
 * language switch.
 */
export function buildPlanes(): Array<Segment<SystemPlane>> {
  return [
    { key: 'sessions', label: i18nT('pages.systemPage.tab_sessions'), icon: <Activity size={14} /> },
    { key: 'performance', label: i18nT('pages.systemPage.tab_performance'), icon: <Cpu size={14} /> },
    { key: 'services', label: i18nT('pages.systemPage.tab_services'), icon: <Server size={14} /> },
  ]
}

export default function SystemPage({ embedded }: { embedded?: boolean } = {}) {
  const [plane, setPlane] = useState<SystemPlane>('sessions')
  return (
    <>
      {!embedded && (
        <PageHeader
          title={i18nT('pages.systemPage.system')}
          subtitle={i18nT('pages.systemPage.live_system_metrics_refreshes_every_2s')}
        />
      )}
      <div className={`${embedded ? '' : 'px-6 pb-8'} overflow-y-auto flex-1 min-h-0`}>
        <div className="mb-4">
          <SegmentedControl<SystemPlane> segments={buildPlanes()} value={plane} onChange={setPlane} />
        </div>
        {/* Mounted one at a time on purpose: each plane polls on its own interval,
            and keeping all three alive would triple the request rate to sample
            data nobody is looking at. */}
        {plane === 'sessions' && <SessionsTab />}
        {plane === 'performance' && <PerformanceTab />}
        {plane === 'services' && <ServicesTab />}
      </div>
    </>
  )
}

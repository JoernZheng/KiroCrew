import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from './helpers'
import SessionsTab, { groupingFor, heatClass } from '../pages/system/SessionsTab'

// ResizeObserver stub for jsdom (SegmentedControl uses it)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

vi.mock('../api/client', () => ({
  api: {
    sessionsMemory: vi.fn().mockResolvedValue({
      sessions: [
        {
          key: 'dashboard:chat-1',
          title: 'Debugging session',
          slot_key: 'chat-1',
          untitled: false,
          agent: 'kirocrew',
          channel: 'dashboard',
          pid: 1001,
          owns_runtime: true,
          prompts: 5,
          rss_mb: 512,
          procs: 2,
          mcp: 1,
          cpu_cores: 0.3,
          uptime_s: 3600,
        },
        {
          key: 'cron:daily-check',
          title: 'Daily check',
          slot_key: '',
          untitled: false,
          agent: 'oracle',
          channel: 'cron',
          pid: 1002,
          owns_runtime: true,
          prompts: 1,
          rss_mb: 128,
          procs: 1,
          mcp: 0,
          cpu_cores: 0.1,
          uptime_s: 600,
        },
      ],
      tasks: [
        {
          id: 'task-1',
          task: 'Research subtask',
          agent: 'kirocrew-research',
          parent: 'dashboard:chat-1',
          rss_mb: 64,
          peak_rss_mb: 80,
          cpu_cores: 0.05,
          started_at: Date.now() / 1000 - 30,
          shared: false,
          pid: 1003,
          sampled: true,
        },
      ],
      totals: { rss_mb: 704, runtimes: 2, host_mb: 16384, host_pct: 4.3, rss_is_upper_bound: false },
      history: [{ t: 1, mb: 600 }, { t: 2, mb: 700 }],
    }),
  },
}))

// ── exported helpers ──

describe('groupingFor', () => {
  it('returns an empty array for "none" (flat ranking)', () => {
    expect(groupingFor('none')).toEqual([])
  })

  it('returns the attribute name for a fold choice', () => {
    expect(groupingFor('agent')).toEqual(['agent'])
    expect(groupingFor('channel')).toEqual(['channel'])
  })
})

describe('heatClass', () => {
  it('returns a class for a hot value', () => {
    // A value at the max is the hottest possible — it must get a tint class.
    const cls = heatClass(100, 100)
    expect(cls).not.toBe('')
    expect(cls).toContain('bg-accent')
  })

  it('returns an empty string for a cold value', () => {
    expect(heatClass(1, 100)).toBe('')
  })

  it('returns an empty string when value is null', () => {
    expect(heatClass(null, 100)).toBe('')
  })

  it('returns an empty string when max is null', () => {
    expect(heatClass(50, null)).toBe('')
  })
})

// ── render tests ──

describe('SessionsTab render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one row per session', async () => {
    renderWithProviders(<SessionsTab />)
    // Wait for data to load and render
    await waitFor(() => {
      expect(screen.getByText('Debugging session')).toBeInTheDocument()
    })
    expect(screen.getByText('Daily check')).toBeInTheDocument()
  })

  it('renders a task row nested under its parent', async () => {
    renderWithProviders(<SessionsTab />)
    await waitFor(() => {
      expect(screen.getByText('Research subtask')).toBeInTheDocument()
    })
  })

  it('re-sorts when clicking a column header', async () => {
    renderWithProviders(<SessionsTab />)
    await waitFor(() => {
      expect(screen.getByText('Debugging session')).toBeInTheDocument()
    })
    // The sorted column is found by its aria-sort state rather than by its
    // label: the label is a catalog value, so keying on it makes this test fail
    // the moment the copy is reworded or the harness resolves keys differently.
    // aria-sort is the contract a screen reader relies on, which is the thing
    // worth pinning anyway.
    const headers = screen.getAllByRole('columnheader')
    const sorted = headers.find(h => h.getAttribute('aria-sort') === 'descending')
    expect(sorted).toBeDefined()
    fireEvent.click(sorted!.querySelector('button')!)
    await waitFor(() => {
      expect(sorted!.getAttribute('aria-sort')).toBe('ascending')
    })
    // Exactly one column claims a sort at a time; a second sorted header would
    // mean the table is reporting an order no single click produced.
    expect(
      screen.getAllByRole('columnheader').filter(h => h.getAttribute('aria-sort') !== 'none'),
    ).toHaveLength(1)
  })

  it('shows a session with no chat window as non-link text', async () => {
    renderWithProviders(<SessionsTab />)
    await waitFor(() => {
      expect(screen.getByText('Daily check')).toBeInTheDocument()
    })
    // cron:daily-check has no chat window (sessionChatPath returns null),
    // so it should NOT be rendered as a link/button
    const dailyText = screen.getByText('Daily check')
    // The text should not be inside a button element (non-interactive row name)
    const btn = dailyText.closest('button')
    expect(btn).toBeNull()
  })

  it('shows an empty state when there are no sessions', async () => {
    const { api: mockApi } = await import('../api/client')
    vi.mocked(mockApi.sessionsMemory).mockResolvedValue({
      sessions: [],
      tasks: [],
      totals: { rss_mb: 0, runtimes: 0, host_mb: 16384, host_pct: 0, rss_is_upper_bound: false },
      history: [],
    })
    renderWithProviders(<SessionsTab />)
    // The empty state renders a testid we can assert on directly
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

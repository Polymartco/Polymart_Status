import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckStatus = 'unknown' | 'operational' | 'degraded' | 'down'

interface CheckDef {
  id: string
  name: string
  url: string
  expectStatus?: number
  staleCheck?: boolean
  critical?: boolean
}

interface CheckState {
  status: CheckStatus
  latency: number | null
  lastChecked: Date | null
  detail: string | null
  latencyHistory: number[]
}

interface GroupDef {
  name: string
  critical: boolean
  checks: CheckDef[]
}

interface MarketSnapshot {
  session: string | null
  indexValue: number | null
  indexChange: number | null
  fearGreed: number | null
  vix: number | null
  tickCount: number | null
  secondsSinceLastTick: number | null
}

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE = 'https://polymart.co'

const GROUPS: GroupDef[] = [
  {
    name: 'Core Simulation',
    critical: true,
    checks: [
      { id: 'health',  name: 'Health Check',  url: `${BASE}/api/v1/getHealth`, staleCheck: true, critical: true },
      { id: 'market',  name: 'Market State',  url: `${BASE}/api/v1/getMarket`, critical: true },
      { id: 'macro',   name: 'Macro Data',    url: `${BASE}/api/v1/getMacro`,  critical: true },
    ],
  },
  {
    name: 'Stock Market API',
    critical: true,
    checks: [
      { id: 'stocks',      name: 'All Stocks',   url: `${BASE}/api/v1/getStocks`,            critical: true },
      { id: 'stock-aapl',  name: 'Single Stock', url: `${BASE}/api/v1/getStock?ticker=QUAK`, critical: true },
      { id: 'topmovers',   name: 'Top Movers',   url: `${BASE}/api/v1/getTopMovers` },
      { id: 'sectors',     name: 'Sectors',      url: `${BASE}/api/v1/getSectors` },
      { id: 'leaderboard', name: 'Leaderboard',  url: `${BASE}/api/v1/getLeaderboard` },
    ],
  },
  {
    name: 'Forex API',
    critical: true,
    checks: [
      { id: 'forex-pairs',    name: 'All Pairs',   url: `${BASE}/api/v1/forex/getPairs`,              critical: true },
      { id: 'forex-pair',     name: 'Single Pair', url: `${BASE}/api/v1/forex/getPair?pair=EURUSD`,   critical: true },
      { id: 'forex-movers',   name: 'Top Movers',  url: `${BASE}/api/v1/forex/getTopMovers` },
      { id: 'forex-sessions', name: 'Sessions',    url: `${BASE}/api/v1/forex/getSessions` },
      { id: 'forex-overview', name: 'Overview',    url: `${BASE}/api/v1/forex/getMarketOverview` },
    ],
  },
  {
    name: 'Paper Trading',
    critical: false,
    checks: [
      { id: 'account', name: 'Account API', url: `${BASE}/api/v1/account/me`, expectStatus: 401 },
    ],
  },
  {
    name: 'Billing',
    critical: false,
    checks: [
      { id: 'billing', name: 'Billing API', url: `${BASE}/api/v1/billing`, expectStatus: 401 },
    ],
  },
]

const ALL_CHECKS: CheckDef[] = GROUPS.flatMap(g => g.checks)

function makeInitialStates(): Record<string, CheckState> {
  return Object.fromEntries(
    ALL_CHECKS.map(c => [
      c.id,
      { status: 'unknown' as CheckStatus, latency: null, lastChecked: null, detail: null, latencyHistory: [] },
    ])
  )
}

// ─── Uptime history ───────────────────────────────────────────────────────────

type DayStatus = 'operational' | 'degraded' | 'down'
type UptimeHistory = Record<string, Record<string, DayStatus>> // group → date → status

const UPTIME_KEY = 'polymart-uptime-v1'
const UPTIME_DAYS = 90

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function last90Days(): string[] {
  return Array.from({ length: UPTIME_DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (UPTIME_DAYS - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

function loadHistory(): UptimeHistory {
  try {
    const raw = localStorage.getItem(UPTIME_KEY)
    return raw ? (JSON.parse(raw) as UptimeHistory) : {}
  } catch {
    return {}
  }
}

function saveHistory(h: UptimeHistory): void {
  try { localStorage.setItem(UPTIME_KEY, JSON.stringify(h)) } catch { /* quota */ }
}

function recordDayStatus(history: UptimeHistory, group: string, status: DayStatus): UptimeHistory {
  const today = todayStr()
  const days = last90Days()
  const prev = history[group] ?? {}
  // Worst status wins within a day (once marked down, stays down for that day)
  const existing = prev[today]
  const next: DayStatus =
    existing === 'down' || status === 'down' ? 'down' :
    existing === 'degraded' || status === 'degraded' ? 'degraded' :
    'operational'
  // Prune to 90-day window
  const pruned = Object.fromEntries(Object.entries(prev).filter(([d]) => days.includes(d)))
  return { ...history, [group]: { ...pruned, [today]: next } }
}

function calcUptime(groupHistory: Record<string, DayStatus>): { pct: number | null; earliest: string | null } {
  const days = last90Days()
  const recorded = days.filter(d => groupHistory[d])
  if (!recorded.length) return { pct: null, earliest: null }
  const operational = recorded.filter(d => groupHistory[d] === 'operational').length
  return {
    pct: Math.round((operational / recorded.length) * 1000) / 10,
    earliest: recorded[0],
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safely coerce a value to a finite number, or null. */
function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function fmt2(v: number | null): string {
  return v !== null ? v.toFixed(2) : '—'
}

function p95(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
}

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('down'))        return 'down'
  if (statuses.includes('degraded'))    return 'degraded'
  if (statuses.includes('operational')) return 'operational'
  return 'unknown'
}

function fearGreedLabel(score: number): string {
  if (score <= 20) return 'Extreme Fear'
  if (score <= 40) return 'Fear'
  if (score <= 60) return 'Neutral'
  if (score <= 80) return 'Greed'
  return 'Extreme Greed'
}

// ─── Check runner ─────────────────────────────────────────────────────────────

interface CheckResult {
  status: CheckStatus
  latency: number
  detail: string | null
  marketData?: Partial<MarketSnapshot>
  healthData?: Partial<MarketSnapshot>
}

async function runCheck(check: CheckDef, retrying = false): Promise<CheckResult> {
  const start = Date.now()
  const expected = check.expectStatus ?? 200
  const isAuthCheck = check.expectStatus === 401
  try {
    // Auth-protected endpoints lack CORS headers, so the browser blocks a
    // normal cross-origin request before it even gets a status code. Using
    // no-cors lets the request through: any response (opaque) = server up;
    // a thrown error = genuine network failure or timeout.
    const res = await fetch(check.url, {
      signal: AbortSignal.timeout(5000),
      mode: isAuthCheck ? 'no-cors' : 'cors',
    })
    const latency = Date.now() - start

    if (isAuthCheck) {
      // Opaque response (status 0) — server responded, auth middleware is up
      if (latency > 2000) return { status: 'degraded', latency, detail: `slow: ${latency}ms` }
      return { status: 'operational', latency, detail: null }
    }

    if (res.status !== expected) {
      if (!retrying) {
        await new Promise(r => setTimeout(r, 3000))
        return runCheck(check, true)
      }
      return { status: 'down', latency, detail: `HTTP ${res.status}` }
    }

    // Parse health / stale check
    let healthData: Partial<MarketSnapshot> | undefined
    if (check.staleCheck) {
      try {
        const json = await res.clone().json() as Record<string, unknown>
        const secs = toNum(json.secondsSinceLastTick) ?? 0
        healthData = {
          secondsSinceLastTick: secs,
          tickCount: toNum(json.tickCount),
        }
        if (secs > 120) return { status: 'down',     latency, detail: `stale: ${secs}s since last tick`, healthData }
        if (secs > 30)  return { status: 'degraded', latency, detail: `stale: ${secs}s since last tick`, healthData }
      } catch { /* body parse error — ignore, use HTTP status only */ }
    }

    // Parse market snapshot
    let marketData: Partial<MarketSnapshot> | undefined
    if (check.id === 'market') {
      try {
        const json = await res.clone().json() as Record<string, unknown>
        marketData = {
          session:     (json.session ?? json.marketSession ?? null) as string | null,
          indexValue:  toNum(json.indexValue ?? json.index),
          indexChange: toNum(json.indexChange ?? json.change),
          fearGreed:   toNum(json.fearGreed ?? json.fearAndGreed),
          vix:         toNum(json.vix),
        }
      } catch { /* ignore */ }
    }

    if (latency > 2000) return { status: 'degraded', latency, detail: `slow: ${latency}ms`, marketData, healthData }
    return { status: 'operational', latency, detail: null, marketData, healthData }
  } catch {
    if (!retrying) {
      await new Promise(r => setTimeout(r, 3000))
      return runCheck(check, true)
    }
    return { status: 'down', latency: Date.now() - start, detail: 'timeout or network error' }
  }
}

// ─── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ status, size = 'sm' }: { status: CheckStatus; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-3 h-3' : 'w-2 h-2'
  const colors: Record<CheckStatus, string> = {
    operational: 'bg-emerald-500',
    degraded:    'bg-amber-500',
    down:        'bg-red-500',
    unknown:     'bg-zinc-500',
  }
  const pulse = status === 'degraded' || status === 'down'
  return (
    <span className={cn('relative inline-flex shrink-0', dim)}>
      {pulse && <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', colors[status])} />}
      <span className={cn('relative inline-flex rounded-full', dim, colors[status])} />
    </span>
  )
}

function StatusBadge({ status, label }: { status: CheckStatus; label?: string }) {
  const config: Record<CheckStatus, { text: string; classes: string }> = {
    operational: { text: 'Operational',  classes: 'text-emerald-500 bg-emerald-500/10' },
    degraded:    { text: 'Degraded',     classes: 'text-amber-500 bg-amber-500/10' },
    down:        { text: 'Down',         classes: 'text-red-500 bg-red-500/10' },
    unknown:     { text: 'Checking…',   classes: 'text-zinc-500 bg-zinc-500/10' },
  }
  const { text, classes } = config[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', classes)}>
      <StatusDot status={status} />
      {label ?? text}
    </span>
  )
}

// ─── Uptime strip ─────────────────────────────────────────────────────────────

function UptimeStrip({ label, groupHistory }: { label: string; groupHistory: Record<string, DayStatus> }) {
  const days = last90Days()
  const { pct } = calcUptime(groupHistory)

  const dotColor = (s: DayStatus | undefined) =>
    !s              ? 'bg-zinc-800'       :
    s === 'down'    ? 'bg-red-500/80'     :
    s === 'degraded'? 'bg-amber-500/80'   :
                      'bg-emerald-500/70'

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 w-36 shrink-0 truncate">{label}</span>
      <div className="flex gap-px flex-1 overflow-hidden">
        {days.map(day => (
          <div
            key={day}
            className={cn('h-5 flex-1 rounded-sm min-w-0', dotColor(groupHistory[day]))}
            title={`${day}: ${groupHistory[day] ?? 'No data'}`}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-500 font-mono shrink-0 w-10 text-right">
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────

function EndpointRow({ check, state }: { check: CheckDef; state: CheckState }) {
  const p = p95(state.latencyHistory)
  const path = check.url.replace('https://polymart.co', '')

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-zinc-800/30 rounded-lg transition-colors">
      <div className="flex items-center gap-2.5 min-w-0 mr-3">
        <StatusDot status={state.status} />
        <span className="text-sm text-zinc-200 truncate">{check.name}</span>
        <span className="font-mono text-xs text-zinc-600 hidden md:inline truncate">{path}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {state.detail && (
          <span className="text-xs text-zinc-500 hidden sm:inline truncate max-w-40">{state.detail}</span>
        )}
        {state.latency !== null && (
          <span
            className="font-mono text-xs text-zinc-500 cursor-default"
            title={p !== null ? `p95: ${p}ms` : undefined}
          >
            {state.latency}ms
          </span>
        )}
        <StatusBadge status={state.status} />
      </div>
    </div>
  )
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({ group, states }: { group: GroupDef; states: Record<string, CheckState> }) {
  const groupStatuses = group.checks.map(c => states[c.id]?.status ?? 'unknown')
  const groupStatus = worstStatus(groupStatuses)
  const hasDown = groupStatuses.some(s => s === 'down')
  const hasUp   = groupStatuses.some(s => s === 'operational' || s === 'degraded')
  const isPartial = hasDown && hasUp

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <StatusDot status={groupStatus} size="md" />
          <span className="text-sm font-medium text-zinc-100">{group.name}</span>
          {group.critical && (
            <span className="text-xs text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5">critical</span>
          )}
        </div>
        {isPartial
          ? <StatusBadge status="degraded" label="Partial Outage" />
          : <StatusBadge status={groupStatus} />
        }
      </div>
      <div className="py-1 px-1">
        {group.checks.map(check => (
          <EndpointRow key={check.id} check={check} state={states[check.id]} />
        ))}
      </div>
    </div>
  )
}

// ─── External deps ────────────────────────────────────────────────────────────

const EXTERNAL_DEPS = [
  { name: 'Clerk',   label: 'Auth provider',   url: 'https://status.clerk.com' },
  { name: 'Stripe',  label: 'Billing',          url: 'https://status.stripe.com' },
  { name: 'Resend',  label: 'Email delivery',   url: 'https://status.resend.com' },
]

function ExternalDepsCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-zinc-700 inline-block shrink-0" />
          <span className="text-sm font-medium text-zinc-100">External Dependencies</span>
        </div>
        <span className="text-xs text-zinc-500">Not monitored directly</span>
      </div>
      <div className="py-1 px-1">
        {EXTERNAL_DEPS.map(dep => (
          <a
            key={dep.name}
            href={dep.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between py-2 px-3 hover:bg-zinc-800/30 rounded-lg transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block shrink-0" />
              <span className="text-sm text-zinc-200">{dep.name}</span>
              <span className="text-xs text-zinc-600">{dep.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-zinc-300 transition-colors">
              <span className="font-mono text-xs hidden sm:inline">{dep.url.replace('https://', '')}</span>
              <ExternalLink className="w-3 h-3" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Market snapshot ──────────────────────────────────────────────────────────

function MarketSnapshot({ snap }: { snap: MarketSnapshot }) {
  const session = (snap.session ?? '').toLowerCase()
  const isOpen    = session.includes('open')
  const isPrePost = session.includes('pre') || session.includes('after')

  const sessionColor = isOpen    ? 'text-emerald-500 bg-emerald-500/10'
                     : isPrePost ? 'text-amber-500 bg-amber-500/10'
                                 : 'text-zinc-500 bg-zinc-500/10'

  const sessionLabel = isOpen                        ? 'Open'
                     : session.includes('pre')       ? 'Pre-market'
                     : session.includes('after')     ? 'After-hours'
                     : session.includes('closed')    ? 'Closed'
                     : snap.session ?? '—'

  const changeSign = (snap.indexChange ?? 0) >= 0 ? '+' : ''
  const changeStr  = snap.indexChange !== null
    ? `${changeSign}${snap.indexChange.toFixed(2)}%`
    : undefined
  const changeColor = snap.indexChange !== null
    ? (snap.indexChange >= 0 ? 'text-emerald-500' : 'text-red-500')
    : undefined

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-100">Live Market Snapshot</span>
        {snap.session && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', sessionColor)}>
            {sessionLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SnapCell label="Index"        value={fmt2(snap.indexValue)}   sub={changeStr}     subColor={changeColor} />
        <SnapCell label="Fear & Greed" value={snap.fearGreed !== null ? String(Math.round(snap.fearGreed)) : '—'} sub={snap.fearGreed !== null ? fearGreedLabel(snap.fearGreed) : undefined} />
        <SnapCell label="VIX"          value={fmt2(snap.vix)} />
        <SnapCell label="Tick #"       value={snap.tickCount !== null ? String(snap.tickCount) : '—'} />
        <SnapCell
          label="Last Tick"
          value={snap.secondsSinceLastTick !== null ? `${snap.secondsSinceLastTick}s ago` : '—'}
          subColor={snap.secondsSinceLastTick !== null && snap.secondsSinceLastTick > 30 ? 'text-amber-500' : undefined}
        />
      </div>
    </div>
  )
}

function SnapCell({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-sm text-zinc-100">{value}</span>
      {sub && <span className={cn('text-xs font-mono', subColor ?? 'text-zinc-500')}>{sub}</span>}
    </div>
  )
}

// ─── Incident history ─────────────────────────────────────────────────────────

const INCIDENTS: { date: string; title: string; status: 'RESOLVED' | 'INVESTIGATING' | 'MONITORING' }[] = []

function IncidentHistory() {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? INCIDENTS : INCIDENTS.slice(0, 5)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-100">Incident History</span>
      </div>
      <div className="p-4">
        {INCIDENTS.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">No incidents in the past 90 days.</p>
        ) : (
          <>
            <div className="space-y-2">
              {visible.map((inc, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className={cn(
                    'shrink-0 text-xs font-mono font-medium px-1.5 py-0.5 rounded mt-0.5',
                    inc.status === 'RESOLVED'   ? 'text-emerald-500 bg-emerald-500/10'
                    : inc.status === 'MONITORING' ? 'text-amber-500 bg-amber-500/10'
                                                  : 'text-red-500 bg-red-500/10'
                  )}>
                    {inc.status}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 shrink-0 mt-1">{inc.date}</span>
                  <span className="text-zinc-300">{inc.title}</span>
                </div>
              ))}
            </div>
            {INCIDENTS.length > 5 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Show less' : `Show ${INCIDENTS.length - 5} more`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Overall banner ───────────────────────────────────────────────────────────

function OverallBanner({ status }: { status: CheckStatus }) {
  const config: Record<CheckStatus, { text: string; classes: string }> = {
    operational: { text: 'All systems operational',                           classes: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    degraded:    { text: 'Partial degradation — some services affected',      classes: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
    down:        { text: 'Major outage — critical services are down',         classes: 'bg-red-500/10 border-red-500/20 text-red-400' },
    unknown:     { text: 'Checking system status…',                           classes: 'bg-zinc-800/50 border-zinc-700 text-zinc-400' },
  }
  const { text, classes } = config[status]
  return (
    <div className={cn('border rounded-xl px-4 py-3 flex items-center gap-3', classes)}>
      <StatusDot status={status} size="md" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [states, setStates] = useState<Record<string, CheckState>>(makeInitialStates)
  const [history, setHistory] = useState<UptimeHistory>(loadHistory)
  const [refreshing, setRefreshing] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [snapshot, setSnapshot] = useState<MarketSnapshot>({
    session: null, indexValue: null, indexChange: null,
    fearGreed: null, vix: null, tickCount: null, secondsSinceLastTick: null,
  })

  // Live "X seconds ago" counter
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(prev => lastChecked ? Math.floor((Date.now() - lastChecked.getTime()) / 1000) : prev)
    }, 1000)
    return () => clearInterval(id)
  }, [lastChecked])

  const runAllChecks = useCallback(async () => {
    setRefreshing(true)
    const checks = GROUPS.flatMap(g => g.checks)
    const resultMap: Record<string, CheckResult> = {}
    const promises: Promise<void>[] = []

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i]
      if (i > 0) await new Promise(r => setTimeout(r, 200))

      const p = runCheck(check).then(result => {
        resultMap[check.id] = result
        setStates(prev => {
          const existing = prev[check.id]
          return {
            ...prev,
            [check.id]: {
              status: result.status,
              latency: result.latency,
              lastChecked: new Date(),
              detail: result.detail,
              latencyHistory: [...(existing?.latencyHistory ?? []), result.latency].slice(-10),
            },
          }
        })
        if (result.marketData) setSnapshot(prev => ({ ...prev, ...result.marketData }))
        if (result.healthData) setSnapshot(prev => ({ ...prev, ...result.healthData }))
      }).catch(() => {})
      promises.push(p)
    }

    await Promise.allSettled(promises)

    // Persist today's worst status per group into localStorage
    setHistory(prev => {
      let next = prev
      for (const group of GROUPS) {
        const groupStatuses = group.checks
          .filter(c => resultMap[c.id])
          .map(c => resultMap[c.id].status)
        if (!groupStatuses.length) continue
        const gs = worstStatus(groupStatuses)
        if (gs === 'unknown') continue
        next = recordDayStatus(next, group.name, gs as DayStatus)
      }
      saveHistory(next)
      return next
    })

    setLastChecked(new Date())
    setSecondsAgo(0)
    setRefreshing(false)
  }, [])

  // Initial + 30s polling
  useEffect(() => {
    void runAllChecks()
    const id = setInterval(runAllChecks, 30_000)
    return () => clearInterval(id)
  }, [runAllChecks])

  const criticalStatuses = GROUPS
    .filter(g => g.critical)
    .flatMap(g => g.checks.map(c => states[c.id]?.status ?? 'unknown'))

  const overallStatus = worstStatus(criticalStatuses)

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <header className="flex items-center justify-between">
          <a href="https://polymart.co" target="_blank" rel="noopener noreferrer">
            <img src="/polymartlogo.png" alt="Polymart" className="h-16" />
          </a>
          <div className="flex items-center gap-3">
            {refreshing && (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Refreshing…
              </span>
            )}
            <span className="text-sm font-medium text-zinc-300">System Status</span>
          </div>
        </header>

        {/* Overall banner */}
        <OverallBanner status={overallStatus} />

        {/* Last checked */}
        <p className="text-xs text-zinc-600 font-mono -mt-2">
          {lastChecked
            ? secondsAgo === 0 ? 'Just checked' : `Last checked ${secondsAgo}s ago`
            : 'Initialising checks…'}
        </p>

        {/* 90-day uptime */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-zinc-100">90-Day Uptime</span>
            <span className="text-xs text-zinc-600 font-mono">
              {(() => {
                const allDates = Object.values(history).flatMap(g => Object.keys(g)).sort()
                return allDates.length
                  ? `Recording since ${allDates[0]}`
                  : `Recording from ${todayStr()}`
              })()}
            </span>
          </div>
          {GROUPS.filter(g => g.critical).map(g => (
            <UptimeStrip key={g.name} label={g.name} groupHistory={history[g.name] ?? {}} />
          ))}
        </div>

        {/* Live snapshot */}
        <MarketSnapshot snap={snapshot} />

        {/* Service groups */}
        {GROUPS.map(group => (
          <GroupCard key={group.name} group={group} states={states} />
        ))}

        {/* External deps */}
        <ExternalDepsCard />

        {/* Incidents */}
        <IncidentHistory />

        {/* Footer */}
        <footer className="flex items-center justify-between pt-4 pb-8 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">
            Polymart status · Updated every 30 seconds
          </p>
          <a
            href="https://polymart.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            polymart.co
            <ExternalLink className="w-3 h-3" />
          </a>
        </footer>

      </div>
    </div>
  )
}

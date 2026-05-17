import { useState, useEffect } from 'react'
import { ExternalLink, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'

type SiteState = 'checking' | 'down' | 'restored'

export default function DownPage() {
  const [siteState, setSiteState] = useState<SiteState>('checking')
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [since] = useState(new Date())

  // Poll polymart.co — if it responds, show restored banner and redirect
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('https://polymart.co/api/v1/getHealth', {
          signal: AbortSignal.timeout(5000),
          mode: 'no-cors', // avoids CORS errors; any response = site is up
        })
        // opaque response (no-cors) means the server responded — site is up
        if (res.type === 'opaque' || res.ok) {
          setSiteState('restored')
          setTimeout(() => { window.location.href = 'https://polymart.co' }, 5000)
          return
        }
      } catch {
        // still down
      }
      setSiteState('down')
    }

    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - since.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [since])

  const duration =
    secondsAgo < 60  ? `${secondsAgo}s` :
    secondsAgo < 3600 ? `${Math.floor(secondsAgo / 60)}m` :
    `${Math.floor(secondsAgo / 3600)}h ${Math.floor((secondsAgo % 3600) / 60)}m`

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 flex flex-col">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <a href="https://polymart.co" target="_blank" rel="noopener noreferrer">
          <img src="/polymartlogo.png" alt="Polymart" className="h-9" />
        </a>
        <a
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
        >
          View system status
          <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">

        {siteState === 'checking' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-6">
              <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-50 mb-2">Checking service status…</h1>
            <p className="text-zinc-500 text-sm">One moment while we verify polymart.co</p>
          </>
        )}

        {siteState === 'restored' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="text-xs font-medium text-emerald-400">Service restored</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-50 mb-3">
              polymart.co is back online
            </h1>
            <p className="text-zinc-400 text-base max-w-md mb-8">
              Service has been restored. Redirecting you automatically in 5 seconds.
            </p>
            <a
              href="https://polymart.co"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-medium text-zinc-950 transition-colors"
            >
              Go to polymart.co now
            </a>
          </>
        )}

        {siteState === 'down' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-red-500" />
              </span>
              <span className="text-xs font-medium text-red-400">Service disruption in progress</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-50 mb-3">
              polymart.co is currently unavailable
            </h1>
            <p className="text-zinc-400 text-base max-w-md mb-8">
              We're aware of the issue and working to restore service as quickly as possible.
              No action is needed on your part.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5 mb-8 flex flex-col items-center gap-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Detected</span>
              <span className="font-mono text-2xl text-zinc-100">{duration}</span>
              <span className="text-xs text-zinc-600 font-mono">
                since {since.toUTCString().replace(' GMT', ' UTC')}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200 transition-colors border border-zinc-700"
              >
                View live status dashboard
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          Polymart status · <a href="/" className="hover:text-zinc-400 transition-colors">status.polymart.co</a>
        </p>
        <a
          href="https://polymart.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
        >
          polymart.co
          <ExternalLink className="w-3 h-3" />
        </a>
      </footer>

    </div>
  )
}

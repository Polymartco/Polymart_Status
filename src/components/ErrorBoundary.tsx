import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              <span className="text-sm font-medium text-zinc-100">Something went wrong</span>
            </div>
            <p className="text-xs text-zinc-500 font-mono break-all">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

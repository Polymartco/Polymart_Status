import { ErrorBoundary } from './components/ErrorBoundary'
import StatusPage from './pages/StatusPage'
import DownPage from './pages/DownPage'

export default function App() {
  const isDown = window.location.pathname === '/down'
  return (
    <ErrorBoundary>
      {isDown ? <DownPage /> : <StatusPage />}
    </ErrorBoundary>
  )
}

import { ErrorBoundary } from './components/ErrorBoundary'
import StatusPage from './pages/StatusPage'

export default function App() {
  return (
    <ErrorBoundary>
      <StatusPage />
    </ErrorBoundary>
  )
}

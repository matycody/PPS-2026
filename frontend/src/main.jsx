import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import * as Sentry from '@sentry/react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ConfirmProvider } from './components/ConfirmProvider'
import { useThemeStore } from './stores/themeStore'
import './lib/syncPrefs'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0, // solo errores
    sendDefaultPii: false,
  })
}

useThemeStore.getState().initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <p>Algo salió mal. Recargá la página.</p>
          <button onClick={() => window.location.reload()}>Recargar</button>
        </div>
      }
    >
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)



import { defineConfig, devices } from '@playwright/test'

// Se prueba contra la web desplegada. URL por variable de entorno:
//   PowerShell:  $env:E2E_BASE_URL="https://tu-app.vercel.app"; npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 1, // el backend de Render puede estar dormido en el primer pedido
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
})

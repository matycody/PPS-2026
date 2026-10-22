import { test, expect } from '@playwright/test'

// Flujos de un visitante sin sesión

test.describe('Visitante', () => {
  test('la home carga sin errores de consola y muestra contenido', async ({ page }) => {
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))
    await page.goto('/')
    await expect(page.locator('#root')).not.toBeEmpty()
    await expect(page.getByText(/Hoy|Próximos|En vivo|Finalizados/i).first()).toBeVisible()
    expect(errores).toEqual([])
  })

  test('no hay scroll horizontal (se adapta al ancho del dispositivo)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(sobra).toBeLessThanOrEqual(1)
  })

  test('liga: lista los torneos', async ({ page }) => {
    await page.goto('/liga')
    await expect(page.getByText('Liga o copas')).toBeVisible()
  })

  test('equipos: se puede buscar un equipo', async ({ page }) => {
    await page.goto('/equipos')
    const buscador = page.getByPlaceholder('Buscar equipo')
    await expect(buscador).toBeVisible()
    await buscador.fill('zzzz-no-existe')
    await expect(page.getByText(/Equipos · 0|sin resultados|no hay/i).first()).toBeVisible()
  })

  test('buscar: el buscador general responde', async ({ page }) => {
    await page.goto('/buscar')
    const campo = page.getByPlaceholder('Torneo, equipo, jugador o partido')
    await expect(campo).toBeVisible()
    await campo.fill('a')
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('una ruta inexistente vuelve al inicio', async ({ page }) => {
    await page.goto('/ruta-que-no-existe')
    await expect(page).toHaveURL(/\/$/)
  })

  test('una ruta de admin sin sesión no deja entrar', async ({ page }) => {
    await page.goto('/admin/partidos')
    await expect(page).not.toHaveURL(/\/admin\/partidos/)
  })

  test('una ruta de control sin sesión no deja entrar', async ({ page }) => {
    await page.goto('/control/id-inexistente')
    await expect(page).not.toHaveURL(/\/control\//)
  })
})

test.describe('Cronómetro offline', () => {
  test('inicia y pausa ambos relojes', async ({ page }) => {
    await page.goto('/cronometro')
    await page.getByRole('button', { name: 'Iniciar ambos' }).click()
    await expect(page.getByRole('button', { name: 'Pausar ambos' })).toBeVisible()
    await page.waitForTimeout(2200)
    await expect(page.locator('body')).toContainText(/19:5\d/) // el partido bajó de 20:00
    await page.getByRole('button', { name: 'Pausar ambos' }).click()
    await expect(page.getByRole('button', { name: 'Iniciar ambos' })).toBeVisible()
  })
})

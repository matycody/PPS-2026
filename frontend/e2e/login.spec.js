import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('muestra el formulario y el enlace de registro', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder('Mail')).toBeVisible()
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible()
    await expect(page.getByRole('link', { name: /Registrate/ }).first()).toBeVisible()
  })

  test('credenciales incorrectas muestran un error y no entran', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Mail').fill('no-existe@ejemplo.com')
    await page.getByPlaceholder('Contraseña').fill('clave-incorrecta-123')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.locator('p.text-danger')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('el mail inválido no se envía', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Mail').fill('esto-no-es-un-mail')
    await page.getByPlaceholder('Contraseña').fill('123456')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  // Requiere una cuenta real de prueba: E2E_EMAIL y E2E_PASSWORD
  test('con una cuenta válida entra y puede cerrar sesión', async ({ page }) => {
    test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Definí E2E_EMAIL y E2E_PASSWORD')
    await page.goto('/login')
    await page.getByPlaceholder('Mail').fill(process.env.E2E_EMAIL)
    await page.getByPlaceholder('Contraseña').fill(process.env.E2E_PASSWORD)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/perfil/)
  })
})

# 🏐 Dodgeball BA Cronómetro — Guía de instalación

Esta guía asume que la PC está en blanco: no tiene Git, ni Node, ni el proyecto clonado.

## 1️⃣ Programas que hay que instalar

Solo **2**. Todo lo demás (React, Express, Prisma, Supabase, etc.) se instala solo más adelante con un comando.

### Git
1. Descargar de https://git-scm.com/downloads e instalar con las opciones por defecto (siguiente, siguiente, siguiente).
2. Abrir una terminal (cmd, PowerShell o Git Bash) y verificar:
```bash
   git --version
```
   Tiene que mostrar un número de versión. Si no lo reconoce, cerrá y volvé a abrir la terminal.

### Node.js 24 (LTS)
1. Descargar la versión **LTS** desde https://nodejs.org (NO la "Current"). El proyecto se probó con `v24.20.0`.
2. Instalar con las opciones por defecto.
3. **Cerrar y volver a abrir la terminal** (obligatorio) y verificar:
```bash
   node --version
   npm --version
```
   `node --version` tiene que empezar con `v24`.

### ⚠️ Solo si usás Windows con PowerShell
Si más adelante `npm` da un error de "la ejecución de scripts está deshabilitada", corré una sola vez:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Cerrá la terminal y volvé a intentar. Alternativa: usar el Símbolo del sistema (cmd) o Git Bash, que no tienen esta restricción.

### Opcionales (no imprescindibles)
- **Visual Studio Code** (https://code.visualstudio.com) como editor.
- **Postman**, solo para probar la API a mano.

## 2️⃣ Credenciales que necesitás antes de arrancar

Estas **no están en el repo** (por seguridad) y hay que pedírselas a Matías o Rodri por un canal privado (nunca por mail ni por Discord en texto plano):

- Connection string de **Neon** (base de datos)
- **Supabase**: URL del proyecto, clave anónima y clave "service role"
- Uno o más mails para usar como **admin de prueba**

Sin esto podés instalar todo, pero el backend no arranca del todo funcional.

## 3️⃣ Clonar el repositorio

```bash
git clone https://github.com/matycody/PPS-2026.git
cd PPS-2026
git branch
```
El último comando tiene que mostrar que estás parado en `main`.

> Elegí una carpeta que **no** esté sincronizada con OneDrive/Google Drive: el proyecto genera miles de archivos (`node_modules`) y la sincronización lo vuelve todo lento.

## 4️⃣ Backend

Abrí una terminal y quedate parado siempre en `backend/` para estos pasos:

```bash
cd backend
npm install
```

Esto instala Express, Socket.IO, Prisma, el cliente de Supabase y todo lo demás automáticamente — no hay que instalar nada de eso a mano.

Copiar la plantilla de variables de entorno:
```bash
# Windows (cmd)
copy .env.example .env

# Mac / Linux / PowerShell / Git Bash
cp .env.example .env
```

Abrir `backend/.env` con el editor y completar con las credenciales del paso 2:
```
PORT=3001
DATABASE_URL=<connection string de Neon>
SUPABASE_URL=<url del proyecto de Supabase>
SUPABASE_ANON_KEY=<clave anon>
SUPABASE_SERVICE_ROLE_KEY=<clave service role>
ADMIN_EMAILS=tu-mail@ejemplo.com
```

Generar el cliente de Prisma (la base de Neon ya existe y es compartida por el equipo, así que solo hace falta esto, no crear tablas ni cargar datos):
```bash
npx prisma generate
```

> ⚠️ No corras `npx prisma migrate deploy` ni `npm run seed` a menos que te conectes a una base de Neon **vacía y nueva**. Contra la base compartida del equipo, esos comandos no hacen falta.

Levantar el servidor:
```bash
npm run dev
```
Tiene que aparecer en la terminal:
```
Servidor escuchando en http://localhost:3001
```
**Dejá esta terminal abierta** mientras trabajás.

## 5️⃣ Frontend

Abrí una **segunda terminal** (sin cerrar la del backend) y andá a la raíz del proyecto:

```bash
cd PPS-2026/frontend
npm install
```

Copiar la plantilla de variables:
```bash
# Windows (cmd)
copy .env.local.example .env.local

# Mac / Linux / PowerShell / Git Bash
cp .env.local.example .env.local
```

Abrir `frontend/.env.local` y completar:
```
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=<la misma URL de Supabase del paso 4>
VITE_SUPABASE_ANON_KEY=<la misma clave anon del paso 4>
```

Levantar el frontend:
```bash
npm run dev
```
La terminal va a mostrar una URL, normalmente:
```
http://localhost:5173
```

## 6️⃣ Verificar que todo quedó bien instalado

**a) El backend responde:**
Abrí en el navegador http://localhost:3001/health — tiene que devolver algo como `{"status":"ok"}`.
> `http://localhost:3001` a secas **no tiene interfaz visual** (da "Cannot GET /"). Es normal, es solo la API.

**b) Test automático completo (recomendado):**
Con el backend corriendo, en una tercera terminal (o parando el backend un segundo y volviendo a levantarlo después):
```bash
cd backend
npm run smoke
```
Corre ~135 chequeos automáticos contra el backend real (crea y borra usuarios de prueba con el prefijo `SMOKE`, no toca datos reales). Si terminan todos en OK, confirmás que Node, Prisma, Neon y Supabase están bien conectados entre sí.

**c) La app se ve:**
Abrí en el navegador la URL que mostró Vite (**http://localhost:5173**, no la 3001). Tiene que verse el cronómetro. Abrí la consola (F12) y confirmá que diga `[socket] conectado`.

**d) El login funciona:**
Andá al dashboard de Supabase → **Authentication → Users** → crear un usuario nuevo con **"Auto Confirm User" activado**. Sin eso el registro pide confirmar el mail y en local no hay forma de recibirlo. Con ese usuario, probá loguearte en la app.

## 7️⃣ Problemas más comunes

| Problema | Qué hacer |
|---|---|
| `node` o `npm` no se reconocen | Cerrá y abrí la terminal de nuevo; si sigue, reinstalá Node.js |
| Error de ejecución de scripts en PowerShell | Ver el paso ⚠️ de más arriba |
| `ENOENT ... package.json` | Estás en la carpeta equivocada: `npm install`/`npm run dev` siempre dentro de `backend/` o `frontend/`, nunca en la raíz del repo |
| `.env.example` no existe | Estás en la carpeta equivocada, o clonaste otra rama (verificá con `git branch` que sea `main`) |
| Prisma dice que una migración fue modificada | `npx prisma migrate reset` (solo si es una base de prueba propia) y después `npm run seed` |
| El registro no confirma el mail | Crear el usuario en Supabase con "Auto Confirm User" en vez de registrarte desde la app |
| El frontend no conecta con el backend | Verificá que la terminal del backend siga corriendo, revisá `VITE_BACKEND_URL` y reiniciá `npm run dev` del frontend |
| `Port 3001 is already in use` | Hay otro proceso usando ese puerto: cerralo, o cambiá `PORT` en `backend/.env` |
| `npm install` tarda muchísimo | La carpeta está dentro de OneDrive/Drive: cloná el repo en otra ubicación |

## ✅ Checklist final
- [ ] `node --version` empieza con `v24`
- [ ] `git --version` funciona
- [ ] `backend/.env` completo con las 6 variables
- [ ] `frontend/.env.local` completo con las 3 variables
- [ ] `npx prisma generate` corrido sin errores
- [ ] Backend corriendo, `http://localhost:3001/health` responde OK
- [ ] `npm run smoke` pasa todos los chequeos
- [ ] Frontend corriendo, la app se ve en `http://localhost:5173`
- [ ] Usuario de prueba creado en Supabase con Auto Confirm, login probado
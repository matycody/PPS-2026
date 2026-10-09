# 🏐 Dodgeball BA Cronómetro — Guía de instalación (estado: fin del Sprint 2)

Cronómetro y gestión de partidos de Dodgeball Buenos Aires: cronómetro de partido y de set sincronizado en tiempo real, roles (visitante, usuario, jugador, árbitro, admin), registro de jugadores con código por mail, auditoría, personalización y PWA.

Esta guía asume una PC **en blanco**: sin Git, sin Node y sin el proyecto. Siguiéndola de arriba abajo queda todo funcionando en local.

**Producción (ya deployado):** https://pps-2026.vercel.app/ (frontend en Vercel, backend en Render, base en Neon, auth en Supabase).

## Cómo está armado

| Parte | Tecnología | Carpeta |
|---|---|---|
| Frontend | React + Vite (PWA) | `frontend/` |
| Backend | Node.js + Express + Socket.IO | `backend/` |
| Base de datos | PostgreSQL en Neon, con Prisma | `backend/prisma/` |
| Autenticación | Supabase Auth (+ Storage para fotos y escudos) | — |

Son **dos programas separados**: el backend (puerto 3001) y el frontend (puerto 5173). Hay que tener los dos corriendo, cada uno en su propia terminal.

---

## 1️⃣ Programas a instalar

Solo **2**. Todo lo demás (React, Express, Prisma, Supabase, etc.) se instala solo con `npm install`.

### Git
1. Descargar de https://git-scm.com/downloads e instalar con las opciones por defecto.
2. En una terminal (cmd, PowerShell o Git Bash):
```bash
git --version
```
Tiene que mostrar una versión. Si no la reconoce, cerrá y abrí la terminal.

### Node.js 24 (LTS)
1. Descargar la versión **LTS** de https://nodejs.org (NO la "Current"). Se probó con `v24.x`.
2. Instalar con las opciones por defecto.
3. **Cerrar y volver a abrir la terminal** (obligatorio) y verificar:
```bash
node --version
npm --version
```
`node --version` tiene que empezar con `v24`.

### ⚠️ Solo Windows con PowerShell
Si `npm` da el error "la ejecución de scripts está deshabilitada", corré una sola vez:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Cerrá la terminal y reintentá. Alternativa: usar cmd o Git Bash.

### Opcionales
- **Visual Studio Code** (https://code.visualstudio.com) como editor.
- **Postman**, para probar la API a mano.
- **Chrome** (recomendado para probar la PWA y el sonido).

---

## 2️⃣ Credenciales (pedirlas al equipo)

Por seguridad **no están en el repo** (que es público). Pedírselas a Matías o Rodri por un canal privado (nunca por mail ni por Discord en texto plano):

- **Connection string de Neon** (base de datos compartida del equipo).
- **Supabase**: URL del proyecto, clave anónima (`anon`) y clave `service_role`.
- **Un mail de admin**: el que se usa para entrar como administrador (ver paso 6).

Sin esto podés instalar todo, pero el backend no queda funcional.

> La base de Neon y el proyecto de Supabase son **compartidos y ya están configurados** (tablas creadas, administradores cargados, envío de mails con Brevo, buckets de fotos). No hay que crear ni migrar nada.

---

## 3️⃣ Clonar el repositorio

```bash
git clone https://github.com/matycody/PPS-2026.git
cd PPS-2026
git branch
```
El último comando tiene que mostrar que estás en `main`.

> Elegí una carpeta que **no** esté sincronizada con OneDrive/Google Drive: `node_modules` genera miles de archivos y la sincronización lo vuelve todo lento.

---

## 4️⃣ Backend

Abrí una terminal y quedate siempre en `backend/` para estos pasos.

```bash
cd backend
npm install
```
Instala Express, Socket.IO, Prisma, el cliente de Supabase, etc.

**Crear el archivo `backend/.env`** (a mano, con tu editor) con este contenido y los valores del paso 2:

```
PORT=3001
DATABASE_URL=<connection string de Neon>
SUPABASE_URL=<url del proyecto de Supabase>
SUPABASE_ANON_KEY=<clave anon>
SUPABASE_SERVICE_ROLE_KEY=<clave service_role>
ADMIN_EMAILS=<mail de admin>
```

- `ADMIN_EMAILS`: mails de los administradores iniciales, separados por coma.
- `SUPABASE_SERVICE_ROLE_KEY` es secreta: va **solo** en el backend, nunca en el frontend ni en git.
- Usá la connection string de Neon **directa** (el host sin `-pooler`) en local.

Generar el cliente de Prisma:
```bash
npx prisma generate
```

> ⚠️ **No corras** `npx prisma migrate deploy` ni `npm run seed` contra la base compartida: ya está migrada y sembrada. Solo si te conectás a una base de Neon **vacía y nueva**: primero `npx prisma migrate deploy` y después `npm run seed` (crea los admins de `ADMIN_EMAILS`).
> Corré siempre los comandos de Prisma parado en `backend/`, no en la raíz.

Levantar el servidor:
```bash
npm run dev
```
Tiene que aparecer en la terminal que el servidor escucha en `http://localhost:3001`. **Dejá esta terminal abierta.**

Scripts del backend: `npm run dev` / `npm start` (servidor), `npm run seed` (crea admins), `npm run smoke` (tests automáticos).

---

## 5️⃣ Frontend

Abrí una **segunda terminal** (sin cerrar la del backend):

```bash
cd PPS-2026/frontend
npm install
```

**Crear el archivo `frontend/.env.local`** (a mano) con:

```
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=<la misma URL de Supabase del paso 4>
VITE_SUPABASE_ANON_KEY=<la misma clave anon del paso 4>
```

> Vite lee estas variables **solo al arrancar**: si las cambiás, reiniciá `npm run dev`.
> Acá va la clave `anon`, **nunca** la `service_role`.

Levantar el frontend:
```bash
npm run dev
```
Va a mostrar una URL, normalmente **http://localhost:5173**.

Scripts del frontend: `npm run dev` (desarrollo), `npm run build` (compilar), `npm run preview` (probar el build), `npm run lint`.

---

## 6️⃣ Verificar que todo funciona

**a) El backend responde.** Abrí http://localhost:3001/health: tiene que devolver algo como `{"status":"ok"}`.
> `http://localhost:3001` a secas no tiene interfaz (muestra "Cannot GET /"). Es normal: es solo la API.

**b) Test automático completo (recomendado).** Con el backend corriendo, en una tercera terminal:
```bash
cd PPS-2026/backend
npm run smoke
```
Corre más de 130 chequeos contra el backend real (autenticación, roles, permisos, equipos, partidos, sockets, auditoría). Crea y borra usuarios de prueba con prefijo `SMOKE`; no toca datos reales. Si todos terminan en OK, Node, Prisma, Neon y Supabase están bien conectados.

**c) La app se ve.** Abrí **http://localhost:5173** (no la 3001). En la consola del navegador (F12) tiene que decir `[socket] conectado`.

**d) Entrar como administrador.**
1. Entrá a http://localhost:5173/login.
2. Con el mail de admin que te pasó el equipo, ingresá con su contraseña. Si es la primera vez y no tiene contraseña, creá el usuario en el dashboard de Supabase → **Authentication → Users → Add user**, con **"Auto Confirm User" activado**, usando un mail que esté en `ADMIN_EMAILS` (o ya sembrado en la base).
3. Tiene que aparecer el menú de administración (partidos, equipos, personas, usuarios, ediciones/auditoría).

**e) Registro de jugador con código por mail.**
1. Cerrá sesión y andá a http://localhost:5173/registro.
2. Ingresá un mail real al que tengas acceso: llega un **código de verificación**.
3. Cargá el código y completá el registro. La cuenta queda **pendiente** hasta que la organización la valide contra la planilla de jugadores (desde el panel de administración).

> El envío de mails sale del SMTP de Brevo ya configurado en Supabase (remitente: el Gmail del proyecto). Puede caer en spam/Promociones, y tiene un **límite de mails por hora**: si no llega, esperá unos minutos o revisá la carpeta de spam.
> Para probar sin depender de mails: crear usuarios en Supabase con "Auto Confirm User".

**f) Cronómetro offline.** Andá a http://localhost:5173/cronometro: es el cronómetro que funciona sin conexión y no requiere login. Si recargás la página con el cronómetro corriendo, **mantiene el tiempo**.

---

## 7️⃣ Probar la PWA (app instalable)

El service worker **solo existe en el build**: en `npm run dev` está desactivado. Para probarla en local:

```bash
cd PPS-2026/frontend
npm run build
npm run preview
```
Abrí la URL que muestra `preview` (normalmente http://localhost:4173) en Chrome: en la barra de direcciones aparece el ícono de **instalar**.

- Instalarla en el **celular** exige HTTPS: usá https://pps-2026.vercel.app/ (menú del navegador → "Instalar app" / "Agregar a pantalla de inicio").
- No requiere variables de entorno ni paquetes extra (`vite-plugin-pwa` ya viene en `package.json`).
- La app guarda en el dispositivo: tema, color, sonido silenciado y el estado del cronómetro offline. Para resetear, borrar los datos del sitio desde el navegador.

---

## 8️⃣ Funciones principales (qué probar)

- **Roles:** visitante (sin cuenta), usuario registrado, jugador, árbitro, admin/organización. El menú cambia según el rol.
- **Cronómetro de partido:** dos tiempos de 20 min, cronómetro de set independiente, pausa grupal, tiempo muerto (1 min por equipo y por mitad), modalidades Foam y Cloth, varias canchas.
- **Sincronización en tiempo real:** abrí el mismo partido en dos pantallas; lo que hace la mesa/árbitro se ve al instante en la otra.
- **Sonidos:** sirena en eventos, silenciable; en torneo suena solo en mesa/árbitro. La pantalla no se apaga mientras corre el cronómetro.
- **Personalización (Perfil):** tema claro/oscuro/sistema, color personal y menú configurable (barra inferior, orden del lateral, tarjetas de inicio).
- **Auditoría (admin → Ediciones):** movimientos de usuarios y ediciones de resultados, con desplegable equipo → jugador.
- **Aún no incluido (Sprint 3):** formatos flexibles de torneo y estadísticas por jugador.

---

## 9️⃣ Deploy (producción)

Se hace desde `main`.

**Backend → Render** (Web Service, carpeta raíz `backend`):
- Build Command: `npm install && npx prisma generate`
- Start Command: `npm start`
- Variables: las mismas del `backend/.env` (con la connection string de Neon **con `-pooler`**) y `NODE_VERSION=24`.
- El plan gratuito **se duerme por inactividad**: la primera petición puede tardar ~30–60 s.

**Frontend → Vercel** (carpeta raíz `frontend`, preset Vite):
- Variables: `VITE_BACKEND_URL` (URL pública de Render), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ Plan Hobby: un deploy a Production se **bloquea** si el autor del commit no es el dueño de la cuenta de Vercel. Flujo del equipo: cada uno trabaja en su rama, abre un **Pull Request** hacia `main` y **Matías hace el merge** (así el commit de merge queda a su nombre). Nunca se pushea directo a `main`: todo entra por PR revisado.

Para verificar producción: correr `npm run smoke` con `BASE_URL=<url de Render>` apuntando al backend deployado.

---

## 🔟 Probar entre dos personas con ngrok (opcional)

Si uno solo corre el backend y el otro solo el frontend: quien tiene el backend corre
```bash
ngrok http 3001 --request-header-add "ngrok-skip-browser-warning: true"
```
y quien tiene el frontend pone esa URL de ngrok en `VITE_BACKEND_URL` de su `frontend/.env.local` y reinicia Vite.

---

## 1️⃣1️⃣ Problemas comunes

| Problema | Qué hacer |
|---|---|
| `node` o `npm` no se reconocen | Cerrá y abrí la terminal; si sigue, reinstalá Node.js |
| Error de ejecución de scripts en PowerShell | Ver el paso ⚠️ de la sección 1 |
| `ENOENT ... package.json` | Estás en la carpeta equivocada: `npm install`/`npm run ...` siempre dentro de `backend/` o `frontend/`, nunca en la raíz |
| `Port 3001 is already in use` | Hay otro proceso en ese puerto: cerralo, o cambiá `PORT` en `backend/.env` (y `VITE_BACKEND_URL`) |
| El backend no arranca / error de base de datos | Revisá `DATABASE_URL` en `backend/.env` y que hayas corrido `npx prisma generate` |
| Prisma dice que una migración fue modificada | Solo en una base de prueba propia: `npx prisma migrate reset` y luego `npm run seed` |
| `Missing SUPABASE...` o error al loguear | Revisá las claves de Supabase en ambos `.env`; reiniciá backend y frontend |
| El frontend no conecta con el backend | Verificá que el backend siga corriendo, revisá `VITE_BACKEND_URL` y reiniciá `npm run dev` del frontend |
| Cambié `frontend/.env.local` y no pasa nada | Vite lee las variables solo al arrancar: reiniciá `npm run dev` |
| No llega el mail con el código | Mirá spam/Promociones; hay límite de mails por hora; o creá el usuario en Supabase con "Auto Confirm User" |
| El registro no confirma el mail | Crear el usuario en Supabase con "Auto Confirm User" en vez de registrarte desde la app |
| La PWA no se instala | Probar con `npm run build` + `npm run preview`, o desde la URL https de Vercel; en `npm run dev` está desactivada |
| El sonido no suena | El navegador exige un toque/click previo en la página; revisá que no esté silenciado en la app |
| La primera carga de producción tarda | Render/Neon gratuitos se duermen por inactividad: esperá ~1 min y recargá |
| `npm install` tarda muchísimo | La carpeta está en OneDrive/Drive: cloná el repo en otra ubicación |

---

## ✅ Checklist final

- [ ] `git --version` funciona y `node --version` empieza con `v24`
- [ ] Repo clonado, estás en `main`
- [ ] `backend/.env` completo (6 variables)
- [ ] `frontend/.env.local` completo (3 variables)
- [ ] `npx prisma generate` corrido sin errores
- [ ] Backend corriendo: `http://localhost:3001/health` responde OK
- [ ] `npm run smoke` pasa todos los chequeos
- [ ] Frontend corriendo: la app se ve en `http://localhost:5173` y la consola dice `[socket] conectado`
- [ ] Login como admin probado y se ve el menú de administración
- [ ] Registro de jugador con código por mail probado (o usuario creado con Auto Confirm)
- [ ] `/cronometro` funciona y mantiene el tiempo al recargar
- [ ] (Opcional) PWA probada con `npm run build` + `npm run preview`
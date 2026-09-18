# 🏐 Dodgeball BA Cronómetro

Cronómetro web para partidos de dodgeball, hecho para **Dodgeball Buenos Aires (DBA)**. Práctica Profesional Supervisada (PPS) 2026.

Maneja dos relojes por partido (partido de 20 min y set de 3 min), dos modalidades (Foam y Cloth) y varias canchas en simultáneo. El estado se sincroniza en tiempo real entre todas las pantallas conectadas.

🔗 **Demo online:** https://pps-2026.vercel.app
🔗 **Backend online:** https://pps-2026.onrender.com
> El backend está en el plan gratuito de Render: si estuvo inactivo, la primera respuesta tarda ~30 s.

## ✨ Qué hace hoy (Sprint 1)
- Dos relojes independientes por partido: partido (20 min) y set (3 min).
- Pausa y reanudación por reloj o de ambos a la vez.
- Selector de modalidad: Foam o Cloth.
- Ambos relojes se congelan en 0:00 hasta un reset manual.
- Control manual de los tiempos (1.º y 2.º) por el árbitro.
- Varias canchas en simultáneo.
- Mensajes automáticos: "SET TERMINADO", "MUERTE SÚBITA (NO HAY ESCUDO)" y "SE TERMINÓ EL PARTIDO".
- Notificaciones apiladas y sincronización en tiempo real entre pantallas.

**Próximos sprints:** login con Supabase Auth y roles, base de datos en Neon, estadísticas y cronograma.

## 🧰 Stack
| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite 8, Zustand 5, Tailwind CSS v4, socket.io-client (Vercel) |
| Backend | Node.js 24, Express 5, Socket.IO 4 (Render) |
| Base de datos | PostgreSQL en Neon, con Prisma 7 (Sprint 2) |
| Auth | Supabase Auth (Sprint 2) |

## 📁 Estructura
```
PPS-2026/
├── backend/
│   ├── server.js                 Punto de entrada (Express + Socket.IO)
│   ├── package.json
│   ├── .env.example              Plantilla de variables
│   └── src/
│       └── timers/
│           └── timerEvents.js    Nombres de los eventos Socket.IO
├── frontend/
│   ├── package.json
│   ├── .env.example              Plantilla de variables
│   └── src/                      Interfaz (React + Vite)
├── .gitignore
└── README.md
```

## 🛠️ Instalación de las tecnologías
Hay que instalar **solo 2 programas**: Git y Node.js. Todo lo demás (React, Vite, Express, Socket.IO, Zustand, Tailwind, Prisma) se instala solo con `npm install`, porque está declarado en el `package.json` de cada carpeta. **No se instala nada de forma global.**

### 1. Git
1. Descargarlo desde https://git-scm.com/downloads e instalarlo con las opciones por defecto.
2. Verificar en una terminal:
```bash
git --version
```

### 2. Node.js (incluye npm)
1. Descargar **Node.js 24 (LTS)** desde https://nodejs.org e instalarlo con las opciones por defecto. El proyecto se desarrolló y probó con `v24.20.0`.
2. **Cerrar y volver a abrir la terminal**, y verificar:
```bash
node --version
npm --version
```
`node --version` debe empezar con `v24`.

### 3. Editor (opcional)
Cualquier editor sirve. Recomendado: Visual Studio Code (https://code.visualstudio.com).

### 4. Postman (opcional)
Solo sirve para probar el backend a mano con eventos Socket.IO. No es necesario para correr el proyecto.

### 5. Lo que instala `npm install`
| Carpeta | Se instala automáticamente |
|---|---|
| `backend/` | Express 5, Socket.IO 4, cors, dotenv y Prisma 7 |
| `frontend/` | React 19, Vite 8, Zustand 5, Tailwind CSS v4 (plugin `@tailwindcss/vite`), socket.io-client y `@supabase/supabase-js` |

## 🚀 Cómo correrlo en local
Todo corre en **una sola computadora**: backend y frontend se levantan en la misma PC, en dos terminales, y se conectan por `localhost`. No hace falta ngrok, ni una segunda máquina, ni un segundo usuario.

> Durante el desarrollo, cada integrante levantaba una parte en su propia PC. Para evaluar el proyecto no es necesario: con los pasos de abajo alcanza.

### 1. Clonar
```bash
git clone https://github.com/matycody/PPS-2026.git
cd PPS-2026
```
> Conviene clonar en una carpeta que **no** esté sincronizada con OneDrive: `node_modules` tiene miles de archivos y la sincronización lo vuelve lento.

### 2. Backend (terminal 1)
```bash
cd backend
npm install
```
Copiar la plantilla de variables:
```bash
# Windows (cmd)
copy .env.example .env

# Mac / Linux / PowerShell / Git Bash
cp .env.example .env
```
Levantar el servidor:
```bash
npm run dev
```
Queda escuchando en `http://localhost:3001`. **Dejá esta terminal abierta.**

### 3. Frontend (terminal 2, misma PC)
Abrí una **segunda terminal** desde la raíz del proyecto:
```bash
cd frontend
npm install
```
Copiar la plantilla de variables:
```bash
# Windows (cmd)
copy .env.example .env.local

# Mac / Linux / PowerShell / Git Bash
cp .env.example .env.local
```
Levantar el frontend:
```bash
npm run dev
```
Se abre en `http://localhost:5173`.

### Scripts disponibles
| Carpeta | Comando | Qué hace |
|---|---|---|
| `backend/` | `npm run dev` | Levanta el servidor (`node server.js`) |
| `frontend/` | `npm run dev` | Servidor de desarrollo de Vite |
| `frontend/` | `npm run build` | Genera el build de producción |
| `frontend/` | `npm run preview` | Sirve el build generado |
| `frontend/` | `npm run lint` | Revisa el código con ESLint |

## 🔑 Variables de entorno
Los archivos `.env` **no se suben al repo** (están en `.gitignore`). Cada carpeta trae un `.env.example` para copiar.

> En local, `VITE_BACKEND_URL` siempre apunta a `http://localhost:3001`.

**`backend/.env`**
| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor. Por defecto `3001` |
| `DATABASE_URL` | Connection string de Neon (con `?sslmode=require`). **Todavía no la usa el cronómetro**: para correr el proyecto en local se puede dejar el valor de ejemplo |

**`frontend/.env.local`**
| Variable | Descripción |
|---|---|
| `VITE_BACKEND_URL` | URL del backend. Local: `http://localhost:3001` |

> Si cambiás una variable de Vite, **reiniciá `npm run dev`**: se lee una sola vez al arrancar.

## 🧪 Cómo probar que funciona
1. Con ambos servidores corriendo, abrí `http://localhost:5173`.
2. Abrí la consola del navegador (F12): tiene que aparecer `[socket] conectado`.
3. Elegí modalidad (Foam o Cloth) e iniciá el partido.
4. Abrí la misma URL en una segunda pestaña o ventana del mismo navegador: los relojes se ven sincronizados.
5. Probá pausar solo el set, pausar ambos y reanudar: cada reloj responde por separado.

## 🩹 Problemas frecuentes
| Problema | Solución |
|---|---|
| `node` o `npm` no se reconocen | Cerrar y abrir la terminal; si sigue, reinstalar Node.js |
| `ENOENT ... package.json` | Estás en la carpeta equivocada: correr `npm` siempre dentro de `backend/` o `frontend/`, nunca en la raíz |
| `.env.example` no se encuentra | Estás en la carpeta equivocada o clonaste una rama vieja: verificá con `git branch` |
| Aviso de Prisma al hacer `npm install` en `backend/` | Se puede ignorar: el script `postinstall` no corta la instalación |
| El frontend no conecta con el backend | Revisar que el backend esté corriendo, que `VITE_BACKEND_URL` esté bien y reiniciar `npm run dev` |
| `Port 3001 is already in use` | Hay otro proceso usando el puerto: cerrarlo o cambiar `PORT` en `backend/.env` |
| `npm install` muy lento | La carpeta está dentro de OneDrive: clonar en otra ubicación |
| En la demo online tarda en responder | Es el cold start de Render: esperar ~30 s |

## 📡 Eventos Socket.IO
Los nombres están centralizados en `backend/src/timers/timerEvents.js`.

**El cliente envía (el backend escucha)**
| Evento | Para qué |
|---|---|
| `match:start` | Iniciar el partido |
| `match:pause` | Pausar (partido, set o ambos, según `target`) |
| `match:resume` | Reanudar (según `target`) |
| `match:reset` | Reiniciar |
| `match:adjust` | Ajustar el tiempo |
| `match:setTime` | Setear el tiempo en segundos totales |
| `match:setModality` | Elegir modalidad (Foam / Cloth) |
| `match:setHalf` | Definir el tiempo (1.º / 2.º) |
| `match:finishHalf` | Terminar el tiempo actual |

**El servidor emite (el frontend escucha)**
| Evento | Para qué |
|---|---|
| `match:tick` | Estado actual de los relojes, cada segundo |
| `match:setExpired` | El set llegó a 0:00 (incluye el mensaje a mostrar) |
| `match:ended` | Terminó el reloj del partido |
| `match:finished` | Terminó el partido |
| `match:paused` | Se pausó |
| `match:resumed` | Se reanudó |
| `match:error` | Error en una acción |

## 🌿 Flujo de trabajo
- Ramas `feature/...` a partir de `main`.
- Nada se mergea a `main` sin **Pull Request con al menos 1 aprobación** de otro integrante.
- Al mergear a `main`, Render (backend) y Vercel (frontend) redeployan solos.

## 👥 Equipo
| Integrante | Rol |
|---|---|
| Matías Luis Sosa | Backend |
| Rodrigo Ezequiel Olivera Calvo | Frontend |
| Juan Ignacio Marcos Merlo | Project Manager / Scrum Master |

## 📚 Documentación
- Jira: https://proyectopps2026.atlassian.net
- Confluence (espacio DDS): manuales de backend, frontend y deploy, arquitectura, modelo de datos y Definition of Done.
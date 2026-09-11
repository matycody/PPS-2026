# PPS-2026 — Cronómetro y gestión de partidos de Dodgeball

Contexto del proyecto para Claude Code. Este proyecto es el TP de Práctica Profesional Supervisada (PPS), curso de ingeniería de software basado en Scrum, con cliente real (Dodgeball Buenos Aires).

## Equipo
- Matías Luis Sosa — Backend
- Rodrigo Ezequiel Olivera Calvo — Frontend
- Juan Ignacio Marcos Merlo
- Scrum Master rota por sprint (Matías → S1, Rodrigo → S2, Juan Ignacio → S3)
- Product Owner: el profesor de la cátedra

## Qué es el proyecto
Sistema de cronómetro y gestión de partidos de dodgeball, con dos timers simultáneos e independientes:
- **Timer de partido**: 20 minutos
- **Timer de set**: 3 minutos

Dos modalidades de juego:
- **Foam**: al expirar el set, pasa a "muerte súbita"
- **Cloth**: al expirar el set, se suman 2 puntos al equipo con más jugadores en cancha y el set se reinicia

Roles del sistema (Sprint 2 en adelante): organización, árbitro, mesa, jugador.

## Stack (fijo para todo el curso, no negociable)
- **Frontend**: React + Vite → deploy en Vercel
- **Backend**: Node.js + Express + Socket.IO → deploy en Render
- **Base de datos**: PostgreSQL + Prisma → hosting en Neon
- **Auth**: Supabase Auth (nunca implementado a mano)

## Estructura del repo (monorepo)
```
/backend   → Node/Express/Socket.IO
/frontend  → React/Vite
```

## Flujo de git (obligatorio)
- `main`: protegida, requiere PR + 1 aprobación. Nunca commitear directo acá.
- `develop`: rama de integración.
- `feature/<nombre>`: una por tarea, sale de `develop`, vuelve a `develop` vía PR.
- Ramas activas: `feature/backend-timer-engine` (Matías), `feature/frontend-setup` (Rodri).

## Plan de sprints
- **Sprint 1** (actual): motor de timers únicamente. Sin roles, sin estadísticas.
- **Sprint 2**: roles, autenticación (Supabase), sincronización en tiempo real.
- **Sprint 3**: estadísticas (quemadas/catches), pestaña "Cronograma", tests.

## Backlog de Sprint 1 (con estimación consensuada en Planning Poker)
| # | Historia | Puntos |
|---|----------|--------|
| 1 | Selección de modalidad (Foam/Cloth) | 1 |
| 2 | Timer de partido individual (start/pausa/reset) | 5 |
| 3 | Timer de set individual (start/pausa/reset) | 3 |
| 4 | Pausa grupal (detiene ambos timers al mismo instante) | 8 |
| 5 | Automatismo Foam (muerte súbita) | 5 |
| 6 | Automatismo Cloth (+2 pts y reinicio de set) | 8 |

**Total: 30 puntos.** El timer de set (historia 3) debe construirse reutilizando la lógica del timer de partido (historia 2) como componente base — no desde cero.

## Modelo de datos
Entidades: `Usuario`, `Equipo`, `Jugador`, `Partido`, `SetPartido`, `Evento`.
- Un Equipo tiene muchos Jugadores.
- Un Partido referencia dos Equipos (local y visitante).
- Un Partido tiene muchos SetPartido y muchos Eventos.
- Un Jugador tiene muchos Eventos (para estadísticas).
- Usuario es independiente: tiene un rol pero no está necesariamente ligado a un Jugador.

Diagrama completo en `/docs/modelo-datos.drawio` (si se copió al repo).

## Arquitectura
- Frontend habla con Backend por **HTTP (REST)** para operaciones CRUD y por **WebSocket (Socket.IO)** para el estado del cronómetro en tiempo real.
- Backend habla con la base de datos vía **Prisma ORM**.
- Supabase Auth valida tokens en el Backend (a partir de Sprint 2).

Diagrama completo en `/docs/arquitectura.drawio` (si se copió al repo).

## Pendiente / a definir antes de programar en paralelo
- **Contrato de eventos Socket.IO**: todavía no se definieron los nombres exactos de eventos (ej. `match:start`, `set:expired`) ni sus payloads. Esto lo tienen que acordar Matías y Rodri antes de avanzar en paralelo sin bloquearse.
- Confirmar cuenta de Figma del equipo.
- Confirmar que Juan Ignacio validó la estimación de Sprint 1 (Planning Poker se hizo con Matías + Rodri).

## Definition of Done del equipo
Una historia se considera terminada cuando:
- El código funciona en local y cumple el criterio de aceptación.
- Pasó por PR revisado por al menos otro integrante (nunca merge directo a main).
- No rompe funcionalidad existente ni deja errores de consola.
- Tiene datos de prueba realistas cargados (nunca placeholders).
- Está probada manualmente contra su criterio de aceptación.
- Está deployada y accesible públicamente (desde Sprint 2).
- Confluence está actualizado si hay cambios de arquitectura o alcance.
- El issue de Jira se movió a "Listo" recién al cumplir todo lo anterior.

## Gestión del proyecto
- Jira: proyecto `PC` ("PPS cronómetro") en proyectopps2026.atlassian.net
- Confluence: espacio `DDS` ("Desarrollo de software")
- Comunicación de equipo: Discord, sesiones de trabajo viernes y sábados 18:00–22:00

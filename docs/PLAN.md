# Plan de trabajo

## Hito 0 — Prototipo (listo)
Escena 3D con el layout real, colas por máquina con datos simulados, panel, tabla, búsqueda, reglas de buffer y semáforo.

## Hito 0.5 — Proceso real (listo, 6-oct-2026)
Modelo SO → ítems → ruta visto en Zoho (`docs/PROCESO.md`), estados de cada paso según la ruta, carga por proceso,
plan sugerido entre máquinas, ¿dónde está mi SO? con rutas, material, menú lateral y formas por familia.

## Hito 1 — Datos reales de Zoho
1. Credenciales Self Client en `.env`.
2. Inspeccionar SO reales y cerrar las preguntas de `docs/ZOHO.md`.
3. Ajustar `server/fuentes/zoho.ts` y `config/zoho-mapeo.json` (campos marcados VERIFICAR); confirmar
   `config/centros.json` (equipo → máquinas, programadores).
4. ~~Bandeja con el valor crudo de Zoho cuando no se reconoce.~~ Hecho: módulo "Sin centro".
5. ~~Tests de `shared/reglas.ts` (vitest) con casos de buffer 2/5/6 y feriados.~~ Hecho (`tests/`); ampliar con casos reales de Zoho.

## Hito 2 — Pulido visual tipo WareTrack
~~Modelos low-poly por familia, LOD de etiquetas, cámara con botones de taller, modo "¿dónde está mi SO?".~~ Hecho.
Falta: animación de entrada de una operación a la máquina cuando cambia de estado; frente real de cada máquina.

## Hito 3 — Puesta en planta
Servir build + API desde una PC de la red de PTS (`npm run build && npm start`), arranque automático,
y validar con supervisores (Jean Carlos, Emanuel, Gerardo) qué falta.

---

## Prompt para iniciar la sesión en Claude Code
> Lee `CLAUDE.md`, `docs/SPEC.md`, `docs/ZOHO.md` y `docs/PLAN.md`. Corre `npm install` y `npm run dev` y
> verifica que el prototipo carga con datos simulados. Luego arrancamos el **Hito 1**: usa el conector de Zoho
> Projects (portal ptsportal388) para inspeccionar 3 proyectos SO- en Producción y sus tareas H.*, muéstrame
> exactamente dónde viene la máquina asignada, las horas y el estado de la tarea, y propón los cambios a
> `config/zoho-mapeo.json`, `config/maquinas.json` y `server/fuentes/zoho.ts`. No cambies las reglas de negocio
> de `CLAUDE.md` sin preguntarme.

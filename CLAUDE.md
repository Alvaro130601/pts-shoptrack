# PTS ShopTrack — contexto para Claude Code

Planta 3D interactiva de **PTS Costa Rica** (mecanizado de precisión para dispositivos médicos) que muestra,
para cada centro de mecanizado, **la orden en proceso, la cola de órdenes y las que vienen por liberar**,
con semáforo de cumplimiento. Inspirado visualmente en *WareTrack* de Dilum Sanjaya (ver `docs/referencia/`).
Usuarios: **supervisores de producción en PC**, uso interactivo (clic en máquina, filtros, detalle).
Dueño del producto: Alvaro (supervisor/coordinador de producción). Idioma de UI y docs: **español**.

## Stack
- `web/` React 19 + Vite + **React Three Fiber** + drei (escena 3D isométrica con cámara ortográfica) + CSS propio.
  `escena/` (planta, cámara, `modelos.tsx` = formas por familia), `hud/` (barra, menú lateral, panel, controles),
  `modulos/` (cajones del menú: cola, alertas, ¿dónde está mi SO?, sin máquina, leyenda).
- `server/` Node + Express (`tsx`). Expone `/api/estado`, `/api/layout`, `/api/salud`. Cachea la lectura de Zoho.
- `shared/` tipos y **reglas de negocio puras** (`reglas.ts`): días hábiles, buffer, cola, semáforo. Sin I/O.
- `npm run dev` levanta API (8787) + web (5173, con proxy a /api). `DATA_SOURCE=seed` usa datos simulados.
- `npm test` corre los tests (vitest, en `tests/`). `npm run build` = typecheck + tests + build.

## Datos
- `data/layout/planta_pts.json` — **posiciones reales** (m) de talleres y máquinas, exportadas del ensamble
  SolidWorks `Ensamble final de taller.SLDASM`. Proyectado a planta, sin la inclinación de 2.41° que tiene el CAD.
  No editar a mano salvo correcciones puntuales; documentarlas en `docs/SPEC.md#layout`.
- `config/maquinas.json` — máquinas: `zoho_nombre` (valor exacto en Zoho), proceso, `familia` (forma 3D), `capacidad_horas_dia`, activa.
- `config/zoho-mapeo.json` — cómo se lee la máquina, horas, fase y flags desde Zoho. **Borrador por confirmar.**
- `config/feriados.json` — feriados de Costa Rica (verificar cada año).

## Proceso real (ver `docs/PROCESO.md`, borrador por validar; visto en SO-10664-MCV-1)
- Un SO (proyecto) tiene **ítems** = listas de tareas `Ítem <línea> (<cantidad> unidades)`. Cada ítem tiene su
  **ruta**: tareas `H. <proceso>` en el orden de la lista. Cada ítem avanza por su cuenta.
- El proceso está en **Equipo asignado** (Fresado, Fresado CNC, Torno CNC, Erosionado, No Requiere = externo).
  **La máquina no está en Zoho**: ShopTrack debe sugerir el reparto entre las máquinas de cada proceso.
- `H. Programación` es tiempo del programador (no de máquina); `H. Set Up` + el mecanizado siguiente van a la misma máquina.
- El modelo actual de la app (operación suelta por máquina, fase por SO) no lo respeta todavía.

## Reglas de negocio de PTS (no cambiar sin pedirlo)
- Zoho Projects: portal **`ptsportal388`** (ID 714664835). Proyectos con prefijo **`SO-`**.
- Excluir estados **Completado** y **Cancelado** salvo que se pida.
- La paginación es obligatoria: traer todas las páginas de proyectos y tareas.
- Tareas **`H.*`** = horas facturables de CNC; `owners_and_work.total_work` = horas de backlog.
- Flujo de fases: Pend. programación → Pend. planos → Pend. material → Producción → Calidad → Envío
  (± Ensamble / Servicio externo). SLA en días hábiles: programación 1, planos 5, material 3, calidad 1, envío 1,
  ensamble 1, servicio externo 3; producción sin SLA fijo.
- **Buffer** antes de la entrega final (días hábiles): Servicio externo + Ensamble → producción termina 6 días antes;
  solo Servicio externo → 5; flujo estándar → 2. La fecha final del proyecto manda la prioridad.
- Semáforo de una operación en máquina: rojo si el límite ya pasó o el fin proyectado (por cola + capacidad) cae
  después del límite; amarillo si la holgura ≤ 1 día hábil; verde en otro caso. (Propuesta v0 — confirmar con Alvaro.)
- La planificación de recursos del proyecto se llama "Gestión de Recursos del Proyecto".

## Convenciones
- TypeScript estricto. Lógica de negocio en `shared/reglas.ts` con tests (vitest) antes de tocarla.
- Nunca subir `.env` ni credenciales. Los datos simulados (`server/fuentes/seed.ts`) usan clientes ficticios.
- No inventar campos de Zoho: si no se sabe cómo viene un dato, inspeccionarlo con la API/MCP y documentarlo en `docs/ZOHO.md`.
- Cambios visuales: verificar con captura (Playwright) antes de dar por terminado.

## Conocido / pendiente
- drei `<Html>` emite en consola "Attempted to synchronously unmount a root…" con React 19 (cosmético).
- Las dependencias (three/drei, ~1.1 MB) van en un chunk `vendor` aparte, cacheable entre versiones.
- Las fuentes vienen de Google Fonts: sin internet en la PC de planta se usa la fuente del sistema.
- Por liberar se pone amarillo con ≤ 2 días hábiles al límite (en máquina es ≤ 1): confirmar con Alvaro.
- Etiquetas se traslapan en zonas densas (Taller #3): falta LOD / agrupación.

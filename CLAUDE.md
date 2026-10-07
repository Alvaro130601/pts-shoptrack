# PTS ShopTrack — contexto para Claude Code

Planta 3D interactiva de **PTS Costa Rica** (mecanizado de precisión para dispositivos médicos) que muestra
la carga de cada proceso, **un reparto sugerido del trabajo entre sus máquinas**, la ruta de cada ítem de cada SO
y qué no llega a tiempo, con semáforo de cumplimiento. Inspirado visualmente en *WareTrack* de Dilum Sanjaya (ver `docs/referencia/`).
Usuarios: **supervisores de producción en PC**, uso interactivo (clic en máquina, filtros, detalle).
Dueño del producto: Alvaro (supervisor/coordinador de producción). Idioma de UI y docs: **español**.

## Stack
- `web/` React 19 + Vite + **React Three Fiber** + drei (escena 3D isométrica con cámara ortográfica) + CSS propio.
  `escena/` (planta, cámara, `modelos.tsx` = formas por familia y color por grupo de proceso, `Taller.tsx` = piso y
  paredes con el color de cada taller), `hud/` (barra, filtros, menú lateral, panel, controles;
  la lógica de los filtros de la planta está en `filtros.ts`: semáforo, estado de máquina, proceso),
  `modulos/` (cajones del menú: carga por proceso, alertas, ¿dónde está mi SO?, material, sin centro, leyenda).
- `server/` Node + Express (`tsx`). Expone `/api/estado`, `/api/layout`, `/api/salud`, `/api/ajustes` y
  `/api/asistente` (NDJSON). Cachea la lectura de Zoho y rearma el plan al momento cuando cambian los ajustes.
- `shared/` tipos y **reglas de negocio puras**, sin I/O: `reglas.ts` (días hábiles, SLA, buffer, semáforo),
  `ruta.ts` (Zoho → SO → ítems → ruta; estados de cada paso), `plan.ts` (reparto sugerido por capacidad,
  límites hacia atrás desde la entrega, semáforo, estado de la planta), `ajustes.ts` (cambios del supervisor
  aplicados antes de planificar), `asistente.ts` (herramientas del asistente, sin I/O) y `zoho.ts` (lectura de la
  vista "Carga de trabajo" de Zoho → proyectos crudos; la usan el servidor y la página).
- **Asistente** (`docs/ASISTENTE.md`): chat con Claude (`@anthropic-ai/sdk`, `claude-opus-5-5`, `server/asistente.ts`)
  que consulta el plan y crea **ajustes del supervisor** (estado, material, prioridad, entrega, máquina, fuera de
  servicio). Los ajustes viven en ShopTrack (`data/ajustes.json`, no se sube), **no se escriben en Zoho** y se quitan
  desde la pestaña Cambios. Necesita `ANTHROPIC_API_KEY` en `.env`.
- `scripts/pagina.ts` (`npm run pagina`): la app como página estática para claude.ai (plan en el navegador, ajustes
  en la base compartida `db`, asistente con la capacidad `sample`); sale en `dist-pagina/` (no se sube). Con
  `PAGINA_ZOHO=1` lee **Zoho en vivo** con el conector Zoho Projects de quien la abre (capacidad `mcp`, solo
  `get_projects_list` y `get_tasks_by_portal`) y los datos de `DATA_SOURCE` quedan de respaldo.
- `npm run dev` levanta API (8787) + web (5173, con proxy a /api). `DATA_SOURCE=seed` usa datos simulados,
  `zoho` lee la API y `excel` lee la exportación de tareas más reciente de `data/exportaciones/` (`server/fuentes/exportacion.ts`).
- `npm test` corre los tests (vitest, en `tests/`). `npm run build` = typecheck + tests + build.

## Datos
- `data/layout/planta_pts.json` — **posiciones reales** (m) de talleres y máquinas, exportadas del ensamble
  SolidWorks `Ensamble final de taller.SLDASM`. Proyectado a planta, sin la inclinación de 2.41° que tiene el CAD.
  No editar a mano salvo correcciones puntuales; documentarlas en `docs/SPEC.md#layout`. Agregadas a mano:
  Rectificadoras #1 y #2 al fondo del Taller #1 (no están en el CAD; posición aproximada).
- `config/maquinas.json` — máquinas: proceso, `familia` (forma 3D), `capacidad_horas_dia`, activa.
- `config/centros.json` — procesos (Equipo asociado en Zoho, o `tareas_zoho` = patrones del nombre de la tarea si no
  trae equipo) → máquinas que los hacen y su `grupo` (color en la planta; `convencional` = tono suave); puestos manuales
  (grabado, limpieza); programadores; proveedores.
  **Propuesta por confirmar con Alvaro.** Confirmado: solo 2 erosionadoras (EDM hilo, CUT E350; la E350 no lo es);
  todo el Torno CNC va al Hyundai y el Hanwa solo hace sus tareas específicas (torno suizo).
- `config/zoho-mapeo.json` — portal, la vista "Carga de trabajo" (grupos, estados de proyecto con su id, tareas "H."
  y sus estados) y cómo se leen ítems, tareas y estados (`lectura`). Revisado con la API v3 el 6-oct-2026 (`docs/ZOHO.md`).
- `config/feriados.json` — feriados de Costa Rica (verificar cada año).
- `data/exportaciones/` — exportaciones de Zoho a Excel con **datos reales: no se suben** (`.gitignore`). Formato y
  límites en `docs/ZOHO.md#exportación-a-excel`.

## Proceso real (ver `docs/PROCESO.md`; visto en SO-10664-MCV-1)
- Un SO (proyecto) tiene **ítems** = listas de tareas `Ítem <línea> (<cantidad> unidades)`. Cada ítem tiene su
  **ruta**: tareas `H. <proceso>` en el orden de la lista. Cada ítem avanza por su cuenta.
- El proceso está en **Equipo asociado** (equipos de Zoho: Fresado, Fresado CNC, Torno CNC, Erosionado, Rectificado…;
  No Requiere Equipo = externo). Programación y Set Up llevan el equipo del mecanizado: la programación se reconoce por
  el nombre. Fecha de entrega = fecha final del proyecto (`end_date`).
  **La máquina no está en Zoho**: ShopTrack debe sugerir el reparto entre las máquinas de cada proceso.
- `H. Programación` es tiempo del programador (no de máquina); `H. Set Up` + el mecanizado siguiente van a la misma máquina.
- Decidido con Alvaro (6-oct): tareas con 3 estados (Pendiente, En proceso, Cerrada); una tarea **Material** al
  inicio de cada ítem; programación = cola de programadores aparte; ShopTrack **sugiere** máquina por carga y el
  supervisor decide (no escribe en Zoho); horas estimadas = total de la tarea.
- La app ya trabaja así: estados de cada paso según su ruta (hecha, en proceso, en cola, en camino, bloqueada) y
  plan hacia adelante que respeta la ruta y la capacidad de cada máquina. La programación avanza mientras llega
  el material; la máquina espera material y programa.

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
- Con la ruta completa, el servicio externo es un paso dentro de la ruta: las rutas terminan `bufferDias − 3`
  días antes de la entrega (calidad y envío, + ensamble) y el límite de cada paso se calcula hacia atrás con lo
  que falta de la ruta. Con el servicio externo al final da los mismos 2/5/6 días.
- Semáforo de una operación: rojo si el límite ya pasó o el fin proyectado (por plan + capacidad) cae después del
  límite; amarillo si la holgura ≤ 1 día hábil; verde en otro caso. (Propuesta v0 — confirmar con Alvaro.)
- La planificación de recursos del proyecto se llama "Gestión de Recursos del Proyecto".

## Convenciones
- TypeScript estricto. Lógica de negocio en `shared/` con tests (vitest) antes de tocarla.
- Nunca subir `.env` ni credenciales. Los datos simulados (`server/fuentes/seed.ts`) usan clientes ficticios.
- No inventar campos de Zoho: si no se sabe cómo viene un dato, inspeccionarlo con la API/MCP y documentarlo en `docs/ZOHO.md`.
- Cambios visuales: verificar con captura (Playwright) antes de dar por terminado.

## Conocido / pendiente
- drei `<Html>` emite en consola "Attempted to synchronously unmount a root…" con React 19 (cosmético).
- Las dependencias (three/drei, ~1.1 MB) van en un chunk `vendor` aparte, cacheable entre versiones.
- Las fuentes vienen de Google Fonts: sin internet en la PC de planta se usa la fuente del sistema.
- La máquina en proceso no está en Zoho: el plan la estima (la que equilibra la carga). Material sin fecha: se
  supone que llega en 3 días hábiles (SLA). Un SO con ensamble y sin servicio externo lleva buffer 2 (regla
  actual; por SLA serían 3): confirmar con Alvaro.
- Etiquetas se traslapan en zonas densas (Taller #3): falta LOD / agrupación.
- Cámara (Alvaro: se pegaba al llegar los datos de Zoho): los callbacks de `MapControls` deben ser estables
  (`useCallback`) y `Camara` lee `useThree` con selectores; si cambian, drei desconecta los controles y corta el
  arrastre en cada redibujo. Las cajas de la pila comparten geometría y van por posición, las máquinas se dibujan
  cuando hay datos y la sombra es de 1024. La página mide los cuadros (en la PC de Alvaro, Intel UHD 620: ~27 ms).
- La exportación a Excel no trae lista de tareas, equipo ni fecha de entrega: los ítems se deducen del orden
  ("Grupo 1, 2…"), el proceso del nombre y no hay semáforo (plan por número de SO). Con Zoho en vivo sí. Ver `docs/ZOHO.md`.
- Zoho en vivo lee las tareas abiertas de la vista más las de Servicio Externo (cuenta como una pausa de la ruta; no
  suma carga a la planta ni al KPI "en proceso": va aparte como `en_proveedor`, Alvaro 7-oct);
  Calidad y Pausado no entran. La entrega es siempre la fecha final; las etiquetas de Zoho no se usan (Alvaro, 6-oct).
- Página con Zoho: sin permiso del conector no lo pide al abrir (botón "Leer Zoho en vivo"); guarda en su base
  (`diagnostico`) el último resultado de Zoho y el último error del navegador para revisarlo con `ArtifactData`.
- Horno: tratamiento y revenido se planifican uno por uno (24 h/día), sin lotes. Grabado y limpieza: 1 puesto de
  8 h/día cada uno, fuera del plano. Por confirmar con Alvaro (`docs/PROCESO.md` §7).

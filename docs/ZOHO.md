# Integración con Zoho Projects

Portal `ptsportal388` (ID `714664835`). Lectura únicamente: ShopTrack nunca escribe en Zoho.

## Qué lee ShopTrack: la vista "Carga de trabajo"
Lo mismo que la vista **Carga de trabajo** de Tareas en Zoho (filtros que mostró Alvaro el 6-oct-2026), configurado
en `config/zoho-mapeo.json → vista`:

| Filtro de la vista | Cómo lo aplica ShopTrack |
|---|---|
| Grupo de proyectos es Producción, Automatizacion | Por nombre del grupo (`project_group.name`) |
| Estado del proyecto es En Producción, Pendiente de material, En Calidad, Pendiente de Planos, Pendiente de Compra | En la API, por id de estado (están en el mapeo) |
| Nombre de tarea contiene `H.` | En la API |
| Estado de la tarea es En Producción, En Curso, Material Pendiente, Pendiente de Operación, Pendiente Operación | La API trae las abiertas (`${all_open}`) y ShopTrack se queda con esos estados por nombre |

Además, solo proyectos `SO-` y nunca Completado ni Cancelado. ShopTrack agrega las tareas en **Servicio Externo**
(Alvaro, 6-oct: el servicio externo cuenta como una **pausa** de la ruta): el paso queda en proceso con el proveedor
(3 días hábiles) y lo que sigue en la ruta lo espera. Las tareas en **Calidad** o **Pausado** no entran, igual que en
la vista; el aviso de la campana dice cuántas son.

Son unas 5 llamadas por lectura (`shared/zoho.ts`): los proyectos en esos estados (~110-150, una página de 200) y las
tareas abiertas con "H." de todo el portal (~600-800, 3-4 páginas). Las tareas se agrupan por proyecto y por lista.

## Dónde se lee
- **Página publicada en claude.ai** (`PAGINA_ZOHO=1 DATA_SOURCE=excel npm run pagina`): lee Zoho en el navegador con
  el conector **Zoho Projects** de quien la abre (capacidad `mcp`, solo `get_projects_list` y `get_tasks_by_portal`).
  Si claude.ai todavía no tiene permiso para usar el conector en la página, no lo pide al abrir (su diálogo taparía la
  planta): la barra muestra **Leer Zoho en vivo** y el permiso se pide al tocarlo; con el permiso dado, lee sola. Si
  está bloqueado, el botón es **Permitir Zoho** (abre los Permisos de la página). Mientras llega, o si no se puede
  (sin conector, sin permiso, Zoho caído, un error al armar el plan), muestra los datos publicados con la página y
  dice por qué en los avisos, con el código de error. Relee cada 5 minutos.
  **Diagnóstico**: la página guarda en su base (colección `diagnostico`) el resultado de la última lectura de Zoho
  (`zoho`: ok, proyectos, tareas, ms o el código de error) y el último error del navegador (`error`), para revisarlo
  a distancia con Claude.
- **Servidor en una PC de planta** (`DATA_SOURCE=zoho`): OAuth con **Self Client**.
  1. https://api-console.zoho.com → *Add Client* → *Self Client* → *Create*.
  2. *Generate Code* con los scopes `ZohoProjects.portals.READ,ZohoProjects.projects.READ,ZohoProjects.tasklists.READ,ZohoProjects.tasks.READ`
     (duración 10 min) y copiar el código.
  3. Cambiarlo por un *refresh token* (en la misma PC, antes de que venzan los 10 min):
     `curl -X POST "https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=ID&client_secret=SECRETO&code=CODIGO"`
     → la respuesta trae `refresh_token`.
  4. En `.env`: `DATA_SOURCE=zoho`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`. Si la cuenta no es
     del centro de datos `.com`, cambiar `ZOHO_ACCOUNTS_URL` y `ZOHO_PROJECTS_API`.
  5. `npm run dev`: la barra superior dice "Zoho". El backend renueva el access token (1 h) solo.

  Las claves nunca van al repositorio ni al chat. La lectura es la misma que la de la página (`shared/zoho.ts`); falta
  confirmar en la primera conexión por OAuth la ruta REST de las tareas de todo el portal (`/api/v3/portal/{id}/tasks`).

## Cómo vienen los datos (API v3)
Revisado con el conector de claude.ai el 6-oct-2026 (muestras de pocos registros).

**Proyecto** (`get_projects_list`, sin `page_info`: se pide hasta una página vacía)

| Campo | Ejemplo | Uso en ShopTrack |
|---|---|---|
| `id`, `key`, `name` | `"1613834000…"`, `PTS-8808`, `SO-10664-MCV-1` | id y nombre del SO; el cliente es el código del nombre (`MCV`) |
| `status` | `{ id, name: "Pendiente de Planos ", is_closed_type }` | Estado (el nombre puede traer espacios de más) |
| `project_group` | `{ id, name: "Producción" }` | Filtro de la vista |
| `end_date` | `"2026-10-20"` (falta si no hay fecha) | **Fecha de entrega** del plan y del semáforo |
| `fecha_pactada`, `fecha_final_produccion`, `fecha_de_aprobacion` | `"2026-10-20"`, `"2026-10-16"` | No se usan: la entrega es siempre la fecha final (Alvaro, 6-oct) |
| `tags` | Prioridad Alta, Prioridad baja, Ensamble, Servicio Externo, Fecha de entrega pendiente… | No se usan (Alvaro, 6-oct) |
| `tasks` | `{ open_count, closed_count }` | — |

No hay campo de cliente: el proyecto trae contacto y correo del cliente, que ShopTrack no lee.

**Tarea** (`get_tasks_by_portal`, con `page_info.has_next_page`)

| Campo | Ejemplo | Uso en ShopTrack |
|---|---|---|
| `project`, `tasklist` | `{ id, name: "SO-…" }`, `{ id, name: "Ítem 1 (19 unidades)" }` | SO e ítem |
| `id`, `prefix`, `name` | `"1613834000…"`, `A22Z-T1`, `H. Torno CNC` | Operación (id estable para los ajustes) |
| `sequence` | `{ sequence: 3 }` | Orden dentro de la lista = ruta |
| `status` | `{ id, name: "Pendiente Operación", is_closed_type }` | Estado |
| `teams` | `[{ id, name: "Torno CNC" }]`, a veces dos | **Equipo asociado** = proceso |
| `owners_and_work.total_work` | `"45:00"` | Horas estimadas: total de la tarea (las horas van a un propietario y los demás llevan 0) |
| `log_hours.total_hours` | `"08:11"` | Horas registradas |
| `depth` | `0` | Las subtareas (`depth > 0`) no entran en la ruta |

**Estados**

| | Nombres (id en `zoho-mapeo.json` para los de proyecto) |
|---|---|
| Proyecto | En Producción, Pendiente de material, En Calidad, Pendiente de Planos, Pendiente de Compra (los de la vista); además Servicio Externo, Grabado, Ensamble, Completado… |
| Tarea abierta | Pendiente Operación, Material Pendiente, En Producción (los que hoy tienen tareas "H."); Servicio Externo (solo en tareas de servicio externo: entra como pausa); Calidad, Pausado (fuera de la vista). "En Curso" y "Pendiente de Operación" están en la vista pero hoy no hay tareas abiertas con ellos |
| Tarea cerrada | Cerrado |

**Equipos** vistos: Fresado, Fresado CNC, Torno, Torno CNC, Erosionado, Rectificado, Tratamiento térmico,
**No Requiere Equipo** (servicios externos: Anodizado, Flash Chrome, también *Erosionado por penetración* y *Hole
Popper*) y Equipo de Diseño (en `H. Grabado`). Consecuencias:
- `H. Programación` y `H. Set Up` llevan el equipo del mecanizado: la programación se reconoce por el nombre (va a la
  cola de programadores) y el Set Up se une al mecanizado que le sigue.
- Si el equipo no es de ningún centro (Equipo de Diseño), manda el nombre de la tarea (`H. Grabado` → Grabado).
- Con dos equipos (`Torno CNC` y `Torno`) se toma el que coincide con el nombre de la tarea.

**Listas de tareas (ítems)**: `Ítem 1 (19 unidades)`, `Ítem 12 (1 unidad)`, `Ítem 1 (1 und)` y también el número de
parte: `PZA-0018-C (6 und)`. La cantidad sale de `item_regex`.

**La máquina no está en Zoho**: se lee el proceso (equipo) y ShopTrack sugiere la máquina.

## Por confirmar
| Pregunta | Dónde se configura |
|---|---|
| La tarea **Material** al inicio de cada ítem (decidido el 6-oct) todavía no existe en Zoho: el material sale del estado `Material Pendiente` | `zoho-mapeo.json → lectura` |
| Solo se leen tareas abiertas: la ruta muestra lo que falta, no los pasos ya cerrados | `shared/zoho.ts` |

## Observado en un SO real (captura del 16-sep-2026)
Vista Tareas de **SO-10664-MCV-1** agrupada por lista de tareas. Ver el modelo completo en `docs/PROCESO.md`.
- Un SO tiene ítems (listas `Ítem <línea> (<cantidad> unidades)`); cada ítem, su ruta de tareas `H. <proceso>`.
- `H. Programación` es tiempo del programador; `H. Set Up` + el mecanizado que le sigue ocupan la misma máquina.
- El estado `Material Pendiente` se repite en todas las tareas del ítem: es una condición del ítem.
- El nombre de la tarea tiene errores de escritura (`H. Progrmación`): el proceso se toma del **equipo**.

## Exportación a Excel
Si no hay conexión con Zoho, ShopTrack lee la exportación de tareas de Zoho Projects (`DATA_SOURCE=excel`).
El `.xlsx` se guarda en `data/exportaciones/` (no se sube al repositorio) y se usa el más reciente; `EXPORT_PATH`
cambia la carpeta o apunta a un archivo. Código: `server/fuentes/exportacion.ts`.

Observado en `task_export_1613834000021378010.xlsx` (6-oct-2026, vista "Carga de trabajo"): una hoja "Todos los
proyectos" con 538 tareas abiertas de 122 SO.

| Columna | Ejemplo | Uso |
|---|---|---|
| Nombre de Tarea | `H. Erosionado (#1)`, `H. Retrabajo set Up` | Operación; el proceso sale del nombre (`tareas_zoho` en `config/centros.json`) |
| Horas de trabajo | `09:00` (texto hh:mm) | Horas estimadas (total de la tarea) |
| Estado personalizado | `Pendiente Operación`, `Material Pendiente`, `En Producción` | Estado de la tarea |
| Diferencia | `(+) 09:00`, `(-) 04:30`, `00:00` | Estimadas − registradas: de aquí salen las horas registradas |
| Nombre del proyecto | `SO-11338-SMT-1` | SO; el cliente es el código del medio (`SMT`). Un mismo número de SO puede tener varios proyectos (`-1`, `-2`…) |

Lo que **no** trae y cómo se suple:
- **Lista de tareas (ítem).** Los ítems se deducen del orden de las filas ("Grupo 1, 2…"): empieza otro grupo cuando
  se repite el nombre de una tarea (`(#1)` y `(#2)` son pasos de la misma ruta), cuando después de un acabado
  (servicio externo, grabado, limpieza) viene trabajo de máquina o programación, o cuando cambia el estado
  `Material Pendiente` (se ponía en todas las tareas de un ítem). Programación y Set Up se van con la operación
  que preparan. Ensamble, calidad y envío van a la lista Cierre del SO.
- **Equipo.** El proceso sale del nombre: `Rectificado (Balony)` y `Rectificadora (Centerless)` → Rectificado;
  `Tratamiento térmico` y `Revenido` → horno; `Flash Chrome`, `Anodizado`, `Electroless`, `Black Oxide`,
  `Erosionado por penetración`, `Hole Popper` → servicio externo; `Grabado`, `Limpieza`, `Rebabeo` → puestos manuales;
  `Retrabajo <proceso>` → ese proceso.
- **Fecha de entrega.** La exportación de tareas no trae la fecha del proyecto: no hay semáforo y el plan reparte por
  número de SO (el más viejo primero).
- **Tareas cerradas.** Solo vienen las abiertas: la primera tarea abierta de cada ítem queda en cola.

La vista deja agregar columnas (*Personalice las columnas que se vayan a mostrar*): con **Lista de tareas** y
**Equipo asociado** se usan los ítems y procesos exactos. Las columnas se reconocen por el título, sin tildes ni
mayúsculas (`COLUMNAS` en `server/fuentes/exportacion.ts`); el orden no importa.

## Acceso desde el entorno de desarrollo
El entorno de nube donde se desarrolla bloquea `*.zoho.com` para llamadas directas. Los datos reales se revisan con
el conector de claude.ai (en una sesión que lo tenga conectado), en una PC de PTS o con la exportación a Excel.

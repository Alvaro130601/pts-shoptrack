# Integración con Zoho Projects

Portal `ptsportal388` (ID `714664835`). Lectura únicamente.

## Autenticación
OAuth 2.0 con **Self Client** (api-console.zoho.com): generar *grant token* con scopes
`ZohoProjects.portals.READ,ZohoProjects.projects.READ,ZohoProjects.tasks.READ` y cambiarlo por un
*refresh token*. El backend renueva el access token (1 h) solo. Variables en `.env` (ver `.env.example`).

## Observado en un SO real
Fuente: captura de la vista Tareas de **SO-10664-MCV-1** (clave `PTS-8808`), agrupada por lista de tareas,
filtro "Todo abierto" (16-sep-2026). Ver el modelo completo en `docs/PROCESO.md`.

| Dato | Cómo aparece | Ejemplo |
|---|---|---|
| SO | Nombre del proyecto `SO-<número>-<sufijo>` | `SO-10664-MCV-1` |
| Ítem | Lista de tareas `Ítem <línea> (<cantidad> unidades)` | `Ítem 23 (3 unidades)`, `Ítem 2-A (4 unidades)` |
| Operación | Tarea `H. <proceso>`, en el orden de la ruta | `H. Torno CNC`, `H. Erosionado`, `H. Anodizado` |
| Proceso / centro | Columna **Equipo asignado** | Fresado, Fresado CNC, Torno CNC, Erosionado, No Requiere |
| Servicio externo | Tarea con equipo **No Requiere** | `H. Anodizado` |
| Responsables | Propietarios = personas, varias por tarea | Maykel +5 |
| Estado | Estados personalizados que mezclan avance y bloqueo | `Material Pendiente`, `Pendiente Op…` |
| Clave de tarea | `<prefijo>-T<n>`, en orden de creación (coincide con la ruta) | `A52Y-T37` … `A52Y-T50` |

Consecuencias para la lectura:
- **La máquina no está en Zoho.** Se lee el proceso (equipo asignado) y ShopTrack sugiere la máquina.
- El nombre de la tarea tiene errores de escritura (`H. Progrmación`): el proceso se toma del **equipo**, no del texto.
- La cantidad sale del nombre de la lista: `/^Ítem\s+(.+?)\s*\((\d+)\s*unidad(?:es)?\)/i`.
- `H. Programación` es tiempo del programador; `H. Set Up` + el mecanizado que le sigue ocupan la misma máquina.
- El estado `Material Pendiente` se repite en todas las tareas del ítem: es una condición del ítem.

## Por confirmar con datos reales (API)
| Pregunta | Dónde se configura |
|---|---|
| Nombre del campo "Equipo asignado" en la API: ¿Equipos de Zoho o campo personalizado? | `config/zoho-mapeo.json` |
| Lista completa de equipos y qué máquinas pertenecen a cada uno | `config/maquinas.json` |
| Orden de las tareas dentro de la lista (campo de secuencia) y si hay dependencias | `server/fuentes/zoho.ts` |
| Formato de `owners_and_work.total_work` con **varios propietarios**. Alvaro: las horas estimadas son el total de la tarea; verificar que `total_work` no las repita por persona | `server/fuentes/zoho.ts` |
| Horas registradas por tarea (Registros de tiempo) para calcular horas pendientes | `server/fuentes/zoho.ts` |
| Nombres exactos de los estados (hoy y después de simplificarlos) | `zoho-mapeo.json → estado_tarea` |
| ¿La fase del SO es el estado del proyecto? ¿Dónde está el cliente? | `zoho-mapeo.json → fase / cliente` |
| Rutas y forma de respuesta v3 (`/api/v3/portal/{id}/projects`, `/projects/{id}/tasklists`, `/projects/{id}/tasks`, paginación) | `server/fuentes/zoho.ts` (marcado `VERIFICAR`) |

## Exportación a Excel
Mientras no se pueda leer la API, ShopTrack lee la exportación de tareas de Zoho Projects (`DATA_SOURCE=excel`).
El `.xlsx` se guarda en `data/exportaciones/` (no se sube al repositorio) y se usa el más reciente; `EXPORT_PATH`
cambia la carpeta o apunta a un archivo. Código: `server/fuentes/exportacion.ts`.

Observado en `task_export_1613834000021378010.xlsx` (6-oct-2026): una hoja "Todos los proyectos" con 538 tareas
abiertas de 122 SO.

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
- **Equipo asignado.** El proceso sale del nombre: `Rectificado (Balony)` y `Rectificadora (Centerless)` → Rectificado;
  `Tratamiento térmico` y `Revenido` → horno; `Flash Chrome`, `Anodizado`, `Electroless`, `Black Oxide` → servicio
  externo; `Grabado`, `Limpieza`, `Rebabeo` → puestos manuales; `Retrabajo <proceso>` → ese proceso.
- **Fecha de entrega.** La exportación de tareas no trae la fecha del proyecto: no hay semáforo y el plan reparte por
  número de SO (el más viejo primero).
- **Tareas cerradas.** Solo vienen las abiertas: la primera tarea abierta de cada ítem queda en cola.

Para la próxima exportación conviene agregar **Lista de tareas** y **Equipo asignado** si la vista lo permite: con
ellas se usan los ítems y procesos exactos. Las columnas se reconocen por el título, sin tildes ni mayúsculas (ver
`COLUMNAS` en `server/fuentes/exportacion.ts`); el orden no importa.

## Acceso desde el entorno de desarrollo
El entorno de nube donde se desarrolla bloquea `*.zoho.com` (`www`, `projects`, `accounts`, `projectsapi`).
Para leer datos reales hay que agregar esos dominios en Network access del entorno, correr la lectura en
una PC de PTS, o usar la exportación a Excel.

## Rendimiento
~90 SO activos × (listas + tareas) → unas 180 llamadas por refresco. Cache de 5 min (`ZOHO_REFRESH_SECONDS`).
Las tareas se leen con 5 llamadas en paralelo. Si se queda corto: filtrar proyectos por estado en la consulta
o pedir solo tareas abiertas, respetando los límites de la API de Zoho.

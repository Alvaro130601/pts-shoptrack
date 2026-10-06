# Integración con Zoho Projects

Portal `ptsportal388` (ID `714664835`). Lectura únicamente.

## Autenticación
OAuth 2.0 con **Self Client** (api-console.zoho.com): generar *grant token* con scopes
`ZohoProjects.portals.READ,ZohoProjects.projects.READ,ZohoProjects.tasks.READ` y cambiarlo por un
*refresh token*. El backend renueva el access token (1 h) solo. Variables en `.env` (ver `.env.example`).

## Lo que hay que confirmar en la sesión 1 (con datos reales)
El usuario confirmó que **la máquina de cada orden está en Zoho**, pero falta saber exactamente dónde.
Inspeccionar 2–3 SO reales (vía la API o el MCP de Zoho en Claude Desktop) y completar:

| Pregunta | Dónde se configura |
|---|---|
| ¿La máquina es campo personalizado de la tarea, etiqueta, parte del nombre de la tarea o lista de tareas? | `config/zoho-mapeo.json → maquina.fuente / campo / regex` |
| Valor exacto con que aparece cada máquina | `config/maquinas.json → zoho_nombre` |
| ¿La fase del SO es el estado del proyecto? Nombres exactos | `zoho-mapeo.json → fase` |
| Nombres de estado de tarea "en progreso" y "cerrada" | `zoho-mapeo.json → estado_tarea` |
| Formato de `owners_and_work.total_work` (número, "hh:mm") y si hay horas registradas para restar | `server/fuentes/zoho.ts` |
| ¿Cómo se sabe si un SO lleva Servicio externo / Ensamble? | `zoho-mapeo.json → flags_proyecto` |
| ¿Dónde está el cliente? | `zoho-mapeo.json → cliente` |
| Rutas y forma de respuesta v3 (`/api/v3/portal/{id}/projects`, `/projects/{id}/tasks`, claves `projects`/`tasks`, paginación) | `server/fuentes/zoho.ts` (marcado `VERIFICAR`) |

## Rendimiento
~90 SO activos × N tareas → 1 + 90+ llamadas por refresco. Cache de 5 min (`ZOHO_REFRESH_SECONDS`).
Si se queda corto: filtrar proyectos por estado en la consulta, pedir solo tareas abiertas, o paralelizar con
límite (p. ej. 5 concurrentes) respetando los límites de la API de Zoho.

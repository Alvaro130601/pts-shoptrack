# Asistente de planificación

Un chat dentro de ShopTrack (menú lateral → **Asistente**) para organizar el trabajo en tiempo real con palabras:

| Se le puede pedir | Ejemplo |
|---|---|
| Consultar la cola de una máquina | "¿Qué hay en cola en la CUT E350?" |
| Buscar dónde va un SO | "¿Cómo va la SO-11357-SMT-3?" |
| Cambiar el estado de operaciones | "El torno de la SO-10268-BIO-9 ya terminó" |
| Marcar que llegó material | "Llegó el material de la SO-11426-SMT-1" |
| Cambiar la prioridad o la fecha de un SO | "Pon la SO-11380-BSC-1 primero", "La SO-11357-SMT-3 se entrega el 20 de octubre" |
| Fijar la máquina de una operación | "El fresado del grupo 2 de la SO-11310-MCV-1 va en la SVM 4100 #2" |
| Sacar una máquina del plan | "La Haas VF-2 está en mantenimiento hasta el jueves" |
| Deshacer | "Quita la prioridad de la SO-11380" |

## Cómo funciona

- **Los cambios son ajustes del supervisor dentro de ShopTrack: no se escriben en Zoho** (decisión del 6-oct:
  ShopTrack sugiere y el supervisor decide). Cada ajuste se ve en la pestaña **Cambios** del asistente y se puede
  quitar; al quitarlo, el plan vuelve a lo que dicen los datos de Zoho.
- El plan se rearma al momento con cada cambio (`shared/ajustes.ts` → `shared/plan.ts`):
  - **Estado** (pendiente / en proceso / cerrada) de las tareas de una operación.
  - **Material**: quita el bloqueo de material del ítem.
  - **Prioridad**: los SO con prioridad (1, 2, …) se planifican antes que el resto; después manda la fecha de entrega.
  - **Entrega**: fecha de entrega del SO (con ella vuelve el semáforo; la exportación a Excel no la trae).
  - **Máquina**: la operación va en esa máquina aunque sea de otro proceso.
  - **Fuera de servicio** (con fecha "hasta" opcional): la máquina se sigue viendo, pero no recibe trabajo.
- Los ajustes se identifican por las tareas de Zoho (`id`). Si una tarea desaparece de los datos (se cerró en
  Zoho), el ajuste queda **sin aplicar** y lo dice; el supervisor lo quita cuando quiera.
- Claude no ve la base de datos: usa 8 herramientas (`shared/asistente.ts`): `buscar_so` y `ver_maquina` para
  consultar, y `cambiar_estado`, `llego_material`, `ajustar_so`, `asignar_maquina`, `marcar_maquina` y
  `quitar_ajustes` para cambiar. Cada pedido lleva un resumen del día (fecha, carga por proceso, máquinas fuera de
  servicio y ajustes vigentes). Si un pedido puede referirse a varias cosas, pregunta antes de cambiar.

## Dos formas de usarlo

### En la planta (servidor de ShopTrack)

1. Crear una clave en https://console.anthropic.com y ponerla en `.env`: `ANTHROPIC_API_KEY=...`
2. Reiniciar (`npm run dev` o `npm start`). Sin clave, el asistente muestra cómo configurarla y lo demás funciona igual.

- Modelo: `claude-opus-5-5` (cambiar con `ASISTENTE_MODELO`), esfuerzo `low` para que responda rápido
  (`ASISTENTE_ESFUERZO=medium` si se equivoca de operación). Si el modelo declina un pedido por política, la API
  reintenta sola con su modelo de respaldo (`fallbacks: "default"`).
- Los ajustes se guardan en `data/ajustes.json` (no se sube al repositorio: nombra SO reales).
- Endpoints: `POST /api/asistente` (eventos NDJSON: texto, herramienta, cambio, fin), `GET /api/ajustes`,
  `DELETE /api/ajustes/:id`. Código: `server/asistente.ts`, `server/ajustes.ts`.
- Cada conversación vive 2 horas en memoria del servidor.

### Como página publicada en claude.ai

`npm run build && DATA_SOURCE=excel npm run pagina` arma `dist-pagina/` (no se sube): la app calcula el plan en el
navegador. Al publicarla con las capacidades `sample`, `db` y `user`:

- el asistente usa la **cuenta de Claude de quien abre la página** (pide permiso la primera vez y gasta su uso);
- los ajustes van a la **base compartida de la página**: todos los que la abren ven los mismos cambios, en vivo.
  Solo el dueño y quienes tengan acceso de Contributor o más pueden cambiar el plan.
- con `PAGINA_ZOHO=1` la página declara también `mcp` (conector Zoho Projects, solo lectura) y el asistente trabaja
  sobre los datos de Zoho en vivo. Los ajustes se guardan por id de tarea: los hechos con la exportación a Excel no
  se aplican a los datos de Zoho (quedan "sin aplicar").

## Límites conocidos

- No escribe en Zoho. Si se quiere que un cambio quede en Zoho, hay que hacerlo allá (o, más adelante, dar permiso de
  escritura a la integración).
- Con la exportación a Excel los ítems son "Grupo 1, 2…" deducidos: el asistente los nombra así.
- Pedidos ambiguos ("cierra el fresado") hacen que pregunte cuál; ser específico ahorra una vuelta.
- ShopTrack no tiene usuarios todavía: en la red interna, cualquiera que lo abra puede usar el asistente y quitar
  cambios. Cada pedido gasta uso de la clave de Claude configurada.

## Instrucción desde un SO

En **¿Dónde está mi SO?**, cada SO tiene un cuadro "Instrucción para este SO". Lo que se escribe ahí ("cerrar el
fresado del ítem 2", "ponerlo de prioridad 1", "llegó el material") va al asistente como *"Sobre el SO-…: …"* y se
aplica igual que en el chat: como cambio del supervisor en ShopTrack, **no en Zoho**. La respuesta aparece debajo del
cuadro y los cambios de ese SO se listan ahí mismo, cada uno con **Quitar**. Al lado están **Copiar SO** (para buscarlo
en Zoho) y **Abrir en Zoho**, que arma el enlace con `config/zoho-mapeo.json → portal.url_proyecto` y el id del
proyecto (solo con Zoho en vivo o la copia de Zoho; la exportación a Excel no trae el id).

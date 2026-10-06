# Especificación — PTS ShopTrack v1

## Objetivo
Que un supervisor vea en segundos, sobre la planta real, **qué está mecanizando cada centro, qué tiene en cola,
qué viene por liberar y qué no va a llegar a tiempo**, y que pueda bajar al detalle de un SO sin abrir Zoho.

## Referencia visual (WareTrack)
Post de @DilumSanjaya: escena 3D isométrica low-poly con objetos animados + HUD flotante en tarjetas
(KPIs arriba, panel de detalle a la derecha, línea de tiempo del envío, tabla de estado de muelles abajo).
Construido con React + React Three Fiber. Equivalencias para PTS:

| WareTrack | PTS ShopTrack |
|---|---|
| Bodega con muelles | Talleres #1–#4 con layout real del CAD |
| Camión en muelle | Centro de mecanizado |
| Tarimas / carga | Pila de bloques = operaciones en cola sobre cada máquina |
| Línea de tiempo del envío | Fases del SO: programación → planos → material → producción → calidad → envío |
| Tabla de muelles | Tabla "Cola por centro" (en proceso, en cola, días de carga, próximo SO) |
| KPIs (stock, camiones, on-time) | SO abiertos, en proceso, en cola, horas en cola, atrasadas / en riesgo |

## Conceptos
- **Operación**: tarea `H.*` de un proyecto `SO-` asignada a una máquina. Es la unidad de la cola.
- **Estado en cola**: `en_proceso` (tarea en progreso, SO en Producción) · `en_cola` (SO en Producción, tarea
  no iniciada) · `por_liberar` (SO todavía en Pend. programación/planos/material, ya con máquina asignada).
- **Límite de producción** = fecha final del proyecto − buffer (2/5/6 días hábiles).
- **Fin proyectado**: se simula la máquina trabajando en orden (en proceso → cola ordenada por límite) a
  `capacidad_horas_dia`; el día hábil donde se acumulan las horas de la operación.
- **Días de carga** de una máquina = horas pendientes (en proceso + cola) ÷ capacidad diaria.

## Vistas (v1)
1. **Planta 3D** (implementado v0): talleres, máquinas orientadas como en el CAD, baliza animada si hay operación
   en proceso, franja de color con el peor semáforo, pila de bloques (azul = en proceso, color = semáforo,
   translúcido = por liberar), chip con nombre y conteos. Clic → panel. Pan/zoom/rotar.
2. **Panel de máquina** (v0): resumen (h en cola, días de carga, capacidad), listas En proceso / En cola /
   Por liberar, detalle expandible con fases, cliente, fin proyectado, motivo del semáforo, buffer y enlace a Zoho.
3. **Tabla "Cola por centro"** (v0): ordenada por días de carga, clic selecciona la máquina en 3D.
4. **Búsqueda y filtro** (v0): por SO, cliente, pieza o máquina; por proceso. Atenúa las máquinas que no coinciden.
5. Pendiente v1: modo "¿dónde está mi SO?" (resalta todas las máquinas por las que pasa un SO y su secuencia),
   bandeja de operaciones **sin máquina** reconocida, vista por proceso (Fresado CNC / Torno CNC / Torno Suizo /
   Erosionado), histórico simple de carga por día.

## Fuera de alcance v1
Editar datos en Zoho, reprogramar la cola desde la app, login por usuario (se sirve en la red interna).

## Layout
Fuente: `Ensamble final de taller.SLDASM` (guardado 2026-07-22). Notas de la revisión del CAD
(`docs/referencia/revision-cad-layout.png`):
- Talleres #2, #3 y #4 están inclinados 2.41° respecto a Taller #1 en el CAD (14 relaciones en error). El JSON
  ignora la inclinación.
- Taller #4 no trae contorno: rectángulo aproximado.
- Cortadora láser sin relaciones en el CAD: posición dudosa.
- RACK MORADO-1 de primer nivel choca con SVM 4100 #2: excluido.
- `proceso_sugerido` sale del nombre del componente; confirmar (Fresadoras/Tornos del Taller #2 ¿convencionales?,
  SYL, E350, H32Z sin identificar).

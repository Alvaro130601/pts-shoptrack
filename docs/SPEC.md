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
Pantalla limpia: la planta 3D ocupa todo el fondo; todo lo demás se abre bajo demanda.
- **Barra superior**: búsqueda (atajo `/`), filtro por proceso, KPIs compactos que abren su módulo
  (atrasadas/en riesgo → Alertas), campana de avisos y estado de la fuente de datos.
- **Menú lateral** con módulos (uno abierto a la vez, en un cajón a la izquierda; `Esc` cierra):
  1. **Cola por centro**: centros ordenables por carga, peor estado o nombre; clic lleva la cámara a la máquina.
  2. **Alertas**: atrasadas / en riesgo ordenadas por holgura, con el motivo del semáforo.
  3. **¿Dónde está mi SO?**: elige un SO → fases, todas sus operaciones (con posición en cola) y resalta sus máquinas.
  4. **Sin máquina**: operaciones sin máquina reconocida, agrupadas por el valor crudo de Zoho, y sin fecha válida.
  5. **Leyenda**: semáforo, torre andon, pila de cajas, tipos de máquina y controles.
- **Planta 3D**: máquinas con **forma aproximada por familia** (`config/maquinas.json → familia`) a escala del CAD,
  torre de luces andon (azul = mecanizando; rojo/amarillo/verde = peor semáforo), huella en el piso con el color
  del semáforo, pila de cajas (azul = en proceso, color = semáforo, translúcido = por liberar). Las etiquetas
  se reducen a un número al alejar la cámara. Controles: General / T1–T4 / acercar / alejar.
- **Panel de máquina** (derecha): estado, h en cola, días de carga, capacidad; En proceso / En cola / Por liberar
  con detalle (fases, cliente, fin proyectado, motivo, buffer, horas, enlace a Zoho).
- Pendiente: vista por proceso con KPIs propios, histórico simple de carga por día, frente real de cada máquina
  (hoy la ventana/panel se dibuja en ambas caras largas porque el CAD no lo indica).

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

# Especificación — PTS ShopTrack v1

## Objetivo
Que un supervisor vea en segundos, sobre la planta real, **cuánto trabajo tiene cada proceso, cómo conviene
repartirlo entre las máquinas, dónde está cada ítem de cada SO y qué no va a llegar a tiempo**, y que pueda bajar
al detalle de un SO sin abrir Zoho. El modelo del proceso está en `docs/PROCESO.md`.

## Referencia visual (WareTrack)
Post de @DilumSanjaya: escena 3D isométrica low-poly con objetos animados + HUD flotante en tarjetas
(KPIs arriba, panel de detalle a la derecha, línea de tiempo del envío, tabla de estado de muelles abajo).
Construido con React + React Three Fiber. Equivalencias para PTS:

| WareTrack | PTS ShopTrack |
|---|---|
| Bodega con muelles | Talleres #1–#4 con layout real del CAD |
| Camión en muelle | Centro de mecanizado |
| Tarimas / carga | Pila de bloques = operaciones en cola sobre cada máquina |
| Línea de tiempo del envío | Ruta de cada ítem: material → programación → procesos → servicio externo |
| Tabla de muelles | "Carga por proceso" (en proceso, en cola, en camino, días de carga, máquinas) |
| KPIs (stock, camiones, on-time) | En proceso, en cola, sin material, ítems atrasados / en riesgo |

## Conceptos
- **SO → ítem → operación**: proyecto `SO-…` → lista de tareas `Ítem N (Q unidades)` → tareas `H. <proceso>` en
  el orden de la ruta. Set Up + mecanizado siguiente = una operación. Detalle en `docs/PROCESO.md`.
- **Proceso (centro de trabajo)**: el Equipo asignado de la tarea; `config/centros.json` dice qué máquinas lo hacen.
- **Estado de una operación**: hecha · en proceso · en cola (puede empezar ya) · en camino (la pieza viene de un
  paso anterior) · bloqueada (falta material, planos o programa).
- **Plan sugerido**: reparto de las operaciones entre las máquinas del proceso respetando la ruta y la capacidad
  (`capacidad_horas_dia`). Da inicio y fin proyectados por operación. El supervisor decide.
- **Límite** de cada paso: hacia atrás desde la entrega (cierre + lo que falta de la ruta).
- **Días de carga** de una máquina o proceso = horas pendientes (en proceso + en cola) ÷ capacidad diaria.

## Vistas (v1)
Pantalla limpia: la planta 3D ocupa todo el fondo; todo lo demás se abre bajo demanda.
- **Barra superior**: búsqueda (atajo `/`), botón **Filtros** (prioridad = semáforo de las órdenes de la máquina:
  atrasadas, en riesgo, a tiempo · máquina: trabajando, sin trabajo, fuera de servicio · proceso; dentro de una
  sección basta una opción, entre secciones se combinan; cada opción dice cuántas máquinas quedan), KPIs compactos que abren su módulo
  (atrasadas/en riesgo → Alertas), campana de avisos y estado de la fuente de datos.
- **Menú lateral** con módulos (uno abierto a la vez, en un cajón a la izquierda; `Esc` cierra):
  1. **Carga por proceso**: cada proceso (equipo de Zoho) con en proceso / en cola / en camino y días de carga;
     al abrirlo, sus máquinas con el reparto sugerido (o la cola de programación / proveedores).
  2. **Alertas**: ítems atrasados / en riesgo, del más crítico al menos, con su ruta y el motivo.
  3. **¿Dónde está mi SO?**: elige un SO → cada ítem con su ruta (✓ ▶ ● ○ !), situación y fin proyectado;
     clic en un paso de máquina lleva a la máquina sugerida. Resalta las máquinas del SO.
  4. **Material**: ítems esperando material, ordenados por la fecha en que hace falta.
  5. **Sin centro**: operaciones con un equipo que no está en `config/centros.json` (solo aparece si hay).
  6. **Leyenda**: cómo se arma el plan, estados, semáforo, máquina, procesos y controles.
- **Planta 3D**: cada taller con su color (piso, franja pintada junto a las paredes, paredes y etiqueta), elegido para
  que contraste con sus máquinas. Máquinas con **forma aproximada por familia** (`config/maquinas.json → familia`) a
  escala del CAD y **color de su grupo de proceso** (`config/centros.json → grupo`: fresado, torno, erosionado,
  rectificado, tratamiento térmico, lámina; el tono suave es la versión convencional; gris = sin proceso),
  torre de luces andon (azul = mecanizando; rojo/amarillo/verde = peor semáforo), huella en el piso con el color
  del semáforo, pila de cajas del plan sugerido (azul = en proceso, color = semáforo, translúcido = próxima). Las etiquetas
  se reducen a un número al alejar la cámara. Controles: General / T1–T4 / acercar / alejar.
- **Panel de máquina** (derecha): proceso, estado, horas, días de carga, capacidad; En proceso / En cola (orden
  sugerido) / Próximas, con la ruta del ítem, horas estimadas y registradas, plan, límite, motivo y enlace a Zoho.
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
- **Cortadora láser** (6-oct-2026): quitada del layout, de las máquinas y de los procesos a pedido de Alvaro ("borra
  la láser grande"). En el CAD no tenía relaciones de posición. Si vuelve a aparecer una tarea "Corte láser", queda
  en *Sin centro*.
- RACK MORADO-1 de primer nivel choca con SVM 4100 #2: excluido.
- `proceso_sugerido` sale del nombre del componente; confirmar (Fresadoras/Tornos del Taller #2 ¿convencionales?,
  SYL, E350, H32Z sin identificar). Alvaro (6-oct): solo hay 2 erosionadoras (EDM hilo y CUT E350), así que **E350** queda
  sin proceso; el Torno Hanwa es solo para tareas específicas (torno suizo).
- **Rectificadoras #1 y #2** (6-oct-2026): no están en el CAD. Alvaro: "son dos máquinas de rectificado, al fondo
  del Taller #1". Se agregaron a mano en el extremo del Taller #1 opuesto a la guillotina y el horno (py ≈ 20,2 m,
  contra la pared, donde el CAD deja el espacio libre), con medidas genéricas de rectificadora plana
  (2,2 × 1,6 × 1,9 m) y el frente hacia el taller. Por confirmar: posición exacta, orientación y cuál es la
  *centerless* (en Zoho hay tareas "Rectificadora (Centerless)").

// Modelo de datos compartido entre backend (server/) y frontend (web/). Ver docs/PROCESO.md.
// SO (proyecto de Zoho) → ítems (listas de tareas) → ruta de operaciones (tareas en el orden de la lista).

// ---------- Datos crudos: como vienen de Zoho o del simulador ----------
export interface TareaCruda {
  id: string;
  clave?: string;             // "A52Y-T37"
  nombre: string;             // "H. Fresado CNC"
  equipo: string | null;      // Equipo asignado: "Fresado CNC", "No Requiere"…
  estado: string;             // estado tal como está en Zoho
  horas_estimadas: number;    // total de la tarea, aunque tenga varios propietarios
  horas_registradas: number;  // registros de tiempo
  url?: string;
  maquina?: string | null;    // máquina indicada por el supervisor (ajuste); Zoho no la trae
  ajustes?: string[];         // ids de los ajustes del supervisor que tocan esta tarea
}

export interface ListaCruda {
  id: string;
  nombre: string;             // "Ítem 23 (3 unidades)" o "Cierre"
  tareas: TareaCruda[];       // en el orden de la lista (= ruta del ítem)
}

export interface ProyectoCrudo {
  id: string;
  nombre: string;             // "SO-10664-MCV-1"
  estado: string;             // estado del proyecto en Zoho
  cliente: string;
  fecha_entrega: string;      // yyyy-mm-dd; '' si no se pudo leer
  url?: string;
  listas: ListaCruda[];
  prioridad?: number;         // fijada por el supervisor: 1 = primero (ajuste)
  ajustes?: string[];
}

// ---------- Configuración ----------
/** Forma 3D aproximada con que se dibuja la máquina en la planta. */
export const FAMILIAS = [
  'fresadora_cnc', 'fresadora_convencional', 'torno_cnc', 'torno_convencional', 'torno_suizo',
  'edm_hilo', 'laser', 'rectificadora', 'horno', 'dobladora', 'guillotina', 'soldadora', 'generica',
] as const;
export type FamiliaMaquina = (typeof FAMILIAS)[number];

export interface MaquinaConfig {
  id: string;
  nombre: string;
  taller: string | null;
  proceso: string | null;
  familia?: FamiliaMaquina;   // si falta se dibuja como "generica"
  capacidad_horas_dia: number;
  es_centro_mecanizado: boolean;
  activa: boolean;
  fuera_de_servicio?: string; // motivo, si el supervisor la sacó del plan (ajuste)
}

/** maquina: Set Up y mecanizado en máquinas del layout · programacion: programadores ·
 *  puesto: trabajo manual o en equipos que no están en el layout (personas × horas) · externo: proveedores */
export type TipoCentro = 'maquina' | 'programacion' | 'puesto' | 'externo';

/** Centro de trabajo = un proceso (equipo de Zoho) con los recursos que lo hacen (config/centros.json). */
export interface CentroConfig {
  id: string;
  nombre: string;
  tipo: TipoCentro;
  equipos_zoho: string[];     // valores de "Equipo asignado" que caen en este centro
  tareas_zoho?: string[];     // si la tarea no trae equipo: expresiones sobre su nombre (sin "H.", sin tildes)
  maquinas?: string[];        // tipo maquina: ids de config/maquinas.json
  personas?: number;          // tipo programacion o puesto: cuántas personas o puestos
  horas_dia?: number;         // tipo programacion o puesto: horas por persona y día hábil
  dias?: number;              // tipo externo: días hábiles por servicio
  grupo?: string;             // tipo maquina: color de sus máquinas en la planta (fresado, torno, erosionado…)
  convencional?: boolean;     // el tono suave del grupo (fresado y torno convencionales)
}

/** Cómo interpretar nombres y estados de Zoho (config/zoho-mapeo.json). Se compara sin tildes ni mayúsculas. */
export interface ReglasLectura {
  item_regex: string;         // grupo 1 = línea, grupo 2 = cantidad
  cierre_regex: string;       // nombre de la lista final del SO
  tareas: {
    programacion: string; set_up: string; material: string; planos: string;
    ensamble: string; calidad: string; envio: string;
  };
  estados: { pendiente: string[]; en_proceso: string[]; cerrada: string[]; material_pendiente: string[] };
}

// ---------- Modelo normalizado ----------
export type EstadoTarea = 'pendiente' | 'en_proceso' | 'cerrada';

/** maquina: Set Up y mecanizado · programacion: programador · externo: proveedor ·
 *  material / planos: condiciones previas del ítem · cierre: ensamble, calidad o envío del SO */
export type TipoPaso = 'maquina' | 'programacion' | 'externo' | 'material' | 'planos' | 'cierre';

/** hecha · en_proceso · en_cola: puede empezar ya · en_camino: la pieza viene de un paso anterior ·
 *  bloqueada: falta material, planos o programa · pendiente: material o planos que aún no llegan */
export type EstadoOp = 'hecha' | 'en_proceso' | 'en_cola' | 'en_camino' | 'bloqueada' | 'pendiente';
export type Semaforo = 'verde' | 'amarillo' | 'rojo';

/** Un paso de la ruta de un ítem. "H. Set Up" se une con el mecanizado que le sigue: van a la misma máquina. */
export interface Operacion {
  id: string;                 // id de la tarea principal
  tareas: string[];           // ids de las tareas de Zoho que la forman
  nombre: string;             // "H. Set Up + H. Fresado CNC"
  tipo: TipoPaso;
  proceso: string;            // nombre del centro, o el equipo tal como vino si no se reconoce
  centro_id: string | null;   // null = equipo no reconocido (o paso sin centro: material, planos, cierre)
  equipo_zoho: string | null;
  estado_tarea: EstadoTarea;  // estado normalizado de Zoho
  estado: EstadoOp;           // estado calculado con la ruta del ítem
  espera?: string;            // qué falta para que pueda empezar
  secuencia: number;          // 1..n dentro de la ruta
  horas_totales: number;
  horas_registradas: number;
  horas_pendientes: number;
  so: string;                 // "SO-10664"
  proyecto: string;           // "SO-10664-MCV-1"
  proyecto_id: string;
  cliente: string;
  item_id: string;
  item: string;               // "Ítem 23"
  cantidad: number | null;
  fecha_entrega: string;
  url_zoho?: string;
  maquina_fija?: string | null; // máquina que fijó el supervisor (ajuste)
  ajustes?: string[];         // ajustes del supervisor que la tocan
  // ---- plan (calculado por shared/plan.ts) ----
  maquina_id?: string | null; // máquina sugerida, o "programacion-1" para un programador
  inicio_proyectado?: string;
  fin_proyectado?: string;
  limite?: string;            // fecha en que debe terminar para llegar a la entrega
  holgura_dias?: number;
  semaforo?: Semaforo;
  motivo?: string;
  posicion?: number;          // 0 = en proceso; 1.. = orden en el plan de su recurso
}

export type Etapa = 'Planos' | 'Material' | 'Programación' | 'Producción' | 'Servicio externo' | 'Cierre' | 'Terminado';
export const ETAPAS: Etapa[] = ['Planos', 'Material', 'Programación', 'Producción', 'Servicio externo', 'Cierre', 'Terminado'];

export interface Item {
  id: string;
  nombre: string;             // "Ítem 23"
  lista: string;              // nombre completo de la lista: "Ítem 23 (3 unidades)"
  cantidad: number | null;
  so: string;
  proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'cerrado';
  etapa: Etapa;
  ruta: Operacion[];
  actual: string | null;      // id de la operación donde está la pieza
  situacion: string;          // "En Fresado CNC", "Esperando material"…
  fin_proyectado?: string;
  limite?: string;
  semaforo?: Semaforo;
  motivo?: string;
}

export interface SO {
  id: string;                 // id del proyecto
  so: string;                 // "SO-10664"
  nombre: string;             // "SO-10664-MCV-1"
  cliente: string;
  fecha_entrega: string;
  estado_zoho: string;
  requiere_servicio_externo: boolean;
  requiere_ensamble: boolean;
  etapa: Etapa;               // la del ítem más atrasado en el flujo
  items: Item[];
  cierre: Operacion[];        // pasos finales del SO (lista "Cierre"), si existen
  url_zoho?: string;
  prioridad?: number;         // fijada por el supervisor (1 = primero)
  ajustes?: string[];
  fin_proyectado?: string;
  semaforo?: Semaforo;
  motivo?: string;
}

export interface EstadoCentro {
  id: string;
  nombre: string;
  tipo: TipoCentro;
  recursos: string[];         // ids de máquinas o de programadores
  capacidad_horas_dia: number;
  en_proceso: number;
  en_cola: number;
  en_camino: number;          // en camino + bloqueadas
  horas_cola: number;         // pendientes de lo que está en proceso o en cola
  horas_total: number;        // todo lo abierto del centro
  dias_carga: number;         // horas_cola / capacidad
  semaforo: Semaforo | 'libre';
  ops: Operacion[];           // abiertas, en orden del plan
}

export interface EstadoMaquina extends MaquinaConfig {
  centro_id: string | null;
  grupo?: string | null;      // del proceso (config/centros.json → grupo): color de la máquina en la planta
  convencional?: boolean;
  en_proceso: Operacion[];
  cola: Operacion[];          // listas para empezar, en el orden sugerido
  proximas: Operacion[];      // en camino o bloqueadas, ya repartidas a esta máquina
  horas_cola: number;         // en proceso + cola (pendientes)
  dias_carga: number;         // horas_cola / capacidad_horas_dia
  semaforo: Semaforo | 'libre';
}

/** Lo que el supervisor puede hacer con la fuente desde la barra: leer Zoho (pide permiso) o abrir los permisos. */
export type AccionFuente = 'conectar_zoho' | 'permisos_zoho';

export interface EstadoPlanta {
  actualizado: string;        // ISO datetime
  fuente: 'seed' | 'zoho' | 'excel';
  datos_de?: string;          // ISO: fecha del archivo exportado (excel) o de la lectura de Zoho en la página
  nota_fuente?: string;       // página publicada: "leyendo Zoho…" o por qué no se pudo leer
  accion_fuente?: AccionFuente; // página publicada: falta que el supervisor conecte Zoho o lo desbloquee
  hoy: string;                // fecha usada para los cálculos
  centros: EstadoCentro[];
  maquinas: EstadoMaquina[];
  sos: SO[];
  sin_centro: Operacion[];    // operaciones cuyo equipo no corresponde a ningún centro
  kpis: {
    so_abiertos: number;
    items_abiertos: number;
    en_proceso: number;       // operaciones en proceso
    en_cola: number;          // operaciones de máquina listas para empezar
    esperando_material: number; // ítems
    atrasados: number;        // ítems en rojo
    en_riesgo: number;        // ítems en amarillo
    items_con_fecha: number;  // ítems abiertos cuyo SO tiene fecha de entrega (sin fecha no hay semáforo)
    horas_cola: number;
  };
  avisos: string[];
  ajustes: AjusteEstado[];    // ajustes del supervisor y si se pudieron aplicar
}

// ---------- Ajustes del supervisor ----------
// Cambios hechos en ShopTrack (no en Zoho) para organizar el trabajo: se guardan aparte y se aplican sobre los
// datos crudos antes de planificar (shared/ajustes.ts). Las tareas se identifican por id; si una tarea desaparece
// de los datos (se cerró en Zoho), el ajuste queda sin aplicar hasta que el supervisor lo quite.
interface AjusteBase {
  id: string;
  creado: string;             // ISO
  descripcion: string;        // "SO-11357-SMT-3 · Grupo 2 · Fresado CNC → Cerrada"
  nota?: string;              // por qué, si el supervisor lo dijo
}
export type Ajuste = AjusteBase & (
  | { tipo: 'estado'; proyecto_id: string; tareas: string[]; estado: EstadoTarea }
  | { tipo: 'material'; proyecto_id: string; tareas: string[] }   // llegó el material de esas tareas
  | { tipo: 'prioridad'; proyecto_id: string; prioridad: number }
  | { tipo: 'entrega'; proyecto_id: string; fecha: string }
  | { tipo: 'maquina'; proyecto_id: string; tareas: string[]; maquina_id: string }
  | { tipo: 'fuera_servicio'; maquina_id: string; motivo: string; hasta?: string }
);
export type TipoAjuste = Ajuste['tipo'];

export interface AjusteEstado {
  id: string;
  tipo: TipoAjuste;
  creado: string;
  descripcion: string;
  nota?: string;
  aplicado: boolean;
  motivo?: string;            // por qué no se aplicó
}

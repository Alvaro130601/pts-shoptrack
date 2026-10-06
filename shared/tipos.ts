// Modelo de datos compartido entre backend (server/) y frontend (web/).
// Unidad de la cola = OPERACIÓN: una tarea H.* de un proyecto SO- asignada a una máquina.
// Un SO puede tener varias operaciones en varias máquinas.

export const FASES = [
  'Pend. programación',
  'Pend. planos',
  'Pend. material',
  'Producción',
  'Calidad',
  'Envío',
] as const;
export type Fase = (typeof FASES)[number] | 'Ensamble' | 'Servicio externo';

/** en_proceso: se está mecanizando ahora · en_cola: liberada a producción, esperando máquina ·
 *  por_liberar: asignada a la máquina pero el SO aún está en una fase previa (programación/planos/material) */
export type EstadoCola = 'en_proceso' | 'en_cola' | 'por_liberar';
export type Semaforo = 'verde' | 'amarillo' | 'rojo';

export interface Operacion {
  id: string;                 // id de tarea en Zoho (o simulado)
  so: string;                 // "SO-1234"
  proyecto_id: string;
  cliente: string;
  descripcion: string;        // nombre de la tarea / pieza
  maquina_id: string | null;  // id del layout (config/maquinas.json); null = no se pudo mapear
  maquina_zoho: string | null;// valor crudo que vino de Zoho
  fase: Fase;
  estado_cola: EstadoCola;
  horas_totales: number;
  horas_pendientes: number;
  fecha_entrega: string;      // ISO yyyy-mm-dd (fecha final del proyecto)
  requiere_servicio_externo: boolean;
  requiere_ensamble: boolean;
  url_zoho?: string;
  // ---- calculados por shared/reglas.ts ----
  fecha_limite_produccion?: string; // entrega − buffer (días hábiles)
  fin_proyectado?: string;          // según posición en cola y capacidad de la máquina
  holgura_dias?: number;            // días hábiles entre fin proyectado y límite
  semaforo?: Semaforo;
  motivo?: string;
  posicion?: number;                // 0 = en proceso, 1.. = orden en cola
}

export interface MaquinaConfig {
  id: string;
  nombre: string;
  taller: string | null;
  proceso: string | null;
  zoho_nombre: string | null;
  capacidad_horas_dia: number;
  es_centro_mecanizado: boolean;
  activa: boolean;
}

export interface EstadoMaquina extends MaquinaConfig {
  en_proceso: Operacion[];
  cola: Operacion[];
  por_liberar: Operacion[];
  horas_cola: number;   // en_proceso + en_cola (pendientes)
  dias_carga: number;   // horas_cola / capacidad_horas_dia
  semaforo: Semaforo | 'libre';
}

export interface EstadoPlanta {
  actualizado: string;          // ISO datetime
  fuente: 'seed' | 'zoho';
  hoy: string;                  // ISO date usada para los cálculos
  maquinas: EstadoMaquina[];
  sin_maquina: Operacion[];     // operaciones abiertas que no se pudieron ubicar en una máquina
  kpis: {
    so_abiertos: number;
    en_proceso: number;
    en_cola: number;
    por_liberar: number;
    atrasadas: number;
    en_riesgo: number;
    horas_cola: number;
  };
  avisos: string[];
}

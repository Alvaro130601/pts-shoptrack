import type { FamiliaMaquina } from '../../shared/tipos';

export const NOMBRE_FAMILIA: Record<FamiliaMaquina, string> = {
  fresadora_cnc: 'Fresadora CNC',
  fresadora_convencional: 'Fresadora convencional',
  torno_cnc: 'Torno CNC',
  torno_convencional: 'Torno convencional',
  torno_suizo: 'Torno suizo',
  edm_hilo: 'Electroerosión por hilo',
  laser: 'Cortadora láser',
  rectificadora: 'Rectificadora',
  horno: 'Horno',
  dobladora: 'Dobladora',
  guillotina: 'Guillotina',
  soldadora: 'Soldadura',
  generica: 'Sin identificar',
};

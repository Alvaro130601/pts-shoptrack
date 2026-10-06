// Datos SIMULADOS para desarrollar el visual sin Zoho. Clientes y SO son ficticios.
// Fechas relativas a "hoy" para que el semáforo siempre tenga casos verde/amarillo/rojo.
import type { MaquinaConfig, Operacion, Fase } from '../../shared/tipos.ts';
import { sumarHabiles } from '../../shared/reglas.ts';

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const CLIENTES = ['Cliente Med-A', 'Cliente Med-B', 'Cliente Ortho-C', 'Cliente Cardio-D', 'Cliente Endo-E', 'Cliente Ind-F'];
const PIEZAS = ['Fixture de inspección', 'Bloque guía', 'Mandril de ensamble', 'Placa base', 'Eje roscado', 'Buje de PEEK',
  'Nido de prensado', 'Pin localizador', 'Soporte de sensor', 'Electrodo', 'Inserto de molde', 'Cubierta de aluminio'];

export function generarSeed(maquinas: MaquinaConfig[], hoy: string, feriados: Set<string>): Operacion[] {
  const r = rng(388);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const ops: Operacion[] = [];
  let so = 4210;
  for (const m of maquinas.filter(x => x.activa && x.es_centro_mecanizado)) {
    const n = Math.floor(r() * 6) + (m.proceso?.includes('CNC') ? 2 : 0); // 0–7 operaciones
    for (let i = 0; i < n; i++) {
      const estado = i === 0 && r() > 0.15 ? 'en_proceso' : r() > 0.25 ? 'en_cola' : 'por_liberar';
      const fase: Fase = estado === 'por_liberar' ? pick(['Pend. programación', 'Pend. planos', 'Pend. material'] as const) : 'Producción';
      const horas = Math.round((2 + r() * 22) * 2) / 2;
      const ext = r() > 0.75, ens = ext && r() > 0.5;
      const num = so++;
      ops.push({
        id: `seed-${num}-${i}`, so: `SO-${num}`, proyecto_id: `seed-${num}`,
        cliente: pick(CLIENTES), descripcion: `H.${pick(['Fresado', 'Torneado', 'Desbaste', 'Acabado', 'Erosionado'])} · ${pick(PIEZAS)}`,
        maquina_id: m.id, maquina_zoho: m.zoho_nombre ?? m.nombre, fase, estado_cola: estado,
        horas_totales: horas, horas_pendientes: estado === 'en_proceso' ? Math.round(horas * (0.2 + r() * 0.6) * 2) / 2 : horas,
        fecha_entrega: sumarHabiles(hoy, Math.floor(r() * 18) - 1, feriados),
        requiere_servicio_externo: ext, requiere_ensamble: ens,
      });
    }
  }
  return ops;
}

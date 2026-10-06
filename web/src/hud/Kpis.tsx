import type { EstadoPlanta } from '../../../shared/tipos';

export function Kpis({ k }: { k: EstadoPlanta['kpis'] }) {
  const items = [
    { t: 'SO abiertos', v: k.so_abiertos, s: 'con operaciones en máquina' },
    { t: 'En proceso', v: k.en_proceso, s: 'mecanizando ahora', c: 'acento' },
    { t: 'En cola', v: k.en_cola, s: `${k.por_liberar} más por liberar` },
    { t: 'Horas en cola', v: k.horas_cola.toLocaleString('es-CR'), s: 'pendientes en centros' },
    { t: 'Atrasadas', v: k.atrasadas, s: `${k.en_riesgo} en riesgo`, c: k.atrasadas ? 'rojo' : 'verde' },
  ];
  return (
    <div className="kpis">
      {items.map(i => (
        <div key={i.t} className="kpi tarjeta">
          <div className="kpi-t">{i.t}</div>
          <div className={`kpi-v ${i.c ?? ''}`}>{i.v}</div>
          <div className="kpi-s">{i.s}</div>
        </div>
      ))}
    </div>
  );
}

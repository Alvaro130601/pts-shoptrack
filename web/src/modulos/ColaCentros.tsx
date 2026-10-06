import { useState } from 'react';
import type { EstadoMaquina } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { Cajon } from './Cajon';

type Orden = 'carga' | 'nombre' | 'semaforo';
const RANGO = { rojo: 0, amarillo: 1, verde: 2, libre: 3 } as const;

export function ColaCentros({ maquinas, seleccion, onIr, onCerrar }:
  { maquinas: EstadoMaquina[]; seleccion: string | null; onIr: (id: string) => void; onCerrar: () => void }) {
  const [orden, setOrden] = useState<Orden>('carga');
  const filas = [...maquinas].sort((a, b) =>
    orden === 'carga' ? b.dias_carga - a.dias_carga
      : orden === 'semaforo' ? RANGO[a.semaforo] - RANGO[b.semaforo] || b.dias_carga - a.dias_carga
        : a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const maxCarga = Math.max(5, ...filas.map(m => m.dias_carga));

  return (
    <Cajon titulo="Cola por centro" sub="Días de carga = horas pendientes ÷ capacidad diaria" onCerrar={onCerrar}
      extra={
        <div className="segmentado" role="tablist" aria-label="Ordenar">
          {([['carga', 'Más carga'], ['semaforo', 'Peor estado'], ['nombre', 'Nombre']] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={orden === k} className={orden === k ? 'activo' : ''} onClick={() => setOrden(k)}>{t}</button>
          ))}
        </div>
      }>
      <div className="tabla-cab-fila"><span /><span>Centro</span><span>Proc.</span><span>Cola</span><span>Carga</span><span>Próximo</span></div>
      {filas.map(m => {
        const prox = m.en_proceso[0] ?? m.cola[0];
        return (
          <button key={m.id} className={`fila ${seleccion === m.id ? 'sel' : ''}`} onClick={() => onIr(m.id)}>
            <span className="punto" style={{ background: colorSemaforo(m.semaforo) }} />
            <span className="nom">{m.nombre}</span>
            <span className="num">{m.en_proceso.length ? '▶ ' + m.en_proceso.length : '—'}</span>
            <span className="num">{m.cola.length}{m.por_liberar.length ? <small> +{m.por_liberar.length}</small> : null}</span>
            <span className="carga-celda">
              <span className="carga"><i style={{ width: `${Math.min(m.dias_carga / maxCarga, 1) * 100}%`, background: colorSemaforo(m.semaforo) }} /></span>
              <span className="num">{m.dias_carga} d</span>
            </span>
            <span className="prox">{prox ? prox.so : '—'}</span>
          </button>
        );
      })}
      {!filas.length && <p className="vacio">Ningún centro coincide con la búsqueda o el filtro.</p>}
    </Cajon>
  );
}

import { useState } from 'react';
import type { EstadoCentro, EstadoMaquina, Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { soCorto } from '../formato';
import { Cajon } from './Cajon';
import { FilaOperacion } from './FilaOperacion';

type Orden = 'carga' | 'semaforo' | 'nombre';
const RANGO = { rojo: 0, amarillo: 1, verde: 2, libre: 3 } as const;

/** Trabajo de cada proceso (centro de trabajo) y su reparto sugerido entre máquinas o programadores. */
export function CargaProcesos({ centros, maquinas, filtro, seleccion, onMaquina, onOp, onCerrar }: {
  centros: EstadoCentro[];
  maquinas: Map<string, EstadoMaquina>;
  filtro: Set<string> | null;      // máquinas que coinciden con la búsqueda o el filtro de proceso
  seleccion: string | null;
  onMaquina: (id: string) => void;
  onOp: (o: Operacion) => void;
  onCerrar: () => void;
}) {
  const [orden, setOrden] = useState<Orden>('carga');
  const filas = [...centros].sort((a, b) =>
    orden === 'carga' ? b.dias_carga - a.dias_carga || b.horas_total - a.horas_total
      : orden === 'semaforo' ? RANGO[a.semaforo] - RANGO[b.semaforo] || b.dias_carga - a.dias_carga
        : a.nombre.localeCompare(b.nombre, 'es'));
  const [abierto, setAbierto] = useState<string | null>(() => filas[0]?.id ?? null);
  const maxCarga = Math.max(3, ...filas.map(c => c.dias_carga));

  return (
    <Cajon titulo="Carga por proceso" sub="Cuánto trabajo tiene cada proceso y cómo se reparte entre sus máquinas. El reparto es una sugerencia." onCerrar={onCerrar}
      extra={
        <div className="segmentado" role="tablist" aria-label="Ordenar">
          {([['carga', 'Más carga'], ['semaforo', 'Peor estado'], ['nombre', 'Nombre']] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={orden === k} className={orden === k ? 'activo' : ''} onClick={() => setOrden(k)}>{t}</button>
          ))}
        </div>
      }>
      {filas.map(c => {
        const abiertoC = abierto === c.id;
        const maqs = c.recursos.map(id => maquinas.get(id)).filter((m): m is EstadoMaquina => !!m && (!filtro || filtro.has(m.id)));
        return (
          <section key={c.id} className={`centro ${abiertoC ? 'abierto' : ''}`}>
            <button className="centro-cab" onClick={() => setAbierto(abiertoC ? null : c.id)} aria-expanded={abiertoC}>
              <span className="punto" style={{ background: colorSemaforo(c.semaforo) }} />
              <span className="nom">{c.nombre}</span>
              <span className="cuentas">
                <span title="En proceso">▶ {c.en_proceso}</span>
                <span title="En cola: listas para empezar">● {c.en_cola}</span>
                <span title="En camino o bloqueadas">○ {c.en_camino}</span>
              </span>
              {c.tipo === 'externo' ? <span className="num externo">proveedor</span> : (
                <span className="carga-celda" title={`${c.dias_carga} días de carga`}>
                  <span className="carga"><i style={{ width: `${Math.min(c.dias_carga / maxCarga, 1) * 100}%`, background: colorSemaforo(c.semaforo) }} /></span>
                  <span className="num">{c.dias_carga} d</span>
                </span>
              )}
              <span className="chev" aria-hidden="true">{abiertoC ? '▾' : '▸'}</span>
            </button>
            {abiertoC && (
              <div className="centro-detalle">
                <p className="nota">{resumen(c)}</p>
                {c.tipo === 'maquina' ? (
                  <>
                    <div className="tabla-cab-fila"><span /><span>Máquina</span><span>Cola</span><span>Carga</span><span>Próximo</span></div>
                    {maqs.map(m => <FilaMaquina key={m.id} m={m} sel={seleccion === m.id} onClick={() => onMaquina(m.id)} />)}
                    {!maqs.length && <p className="vacio">Ninguna máquina coincide con la búsqueda.</p>}
                  </>
                ) : c.ops.map(o => <FilaOperacion key={o.id} o={o} onClick={() => onOp(o)} />)}
                {!c.ops.length && c.tipo !== 'maquina' && <p className="vacio">Sin trabajo abierto.</p>}
              </div>
            )}
          </section>
        );
      })}
    </Cajon>
  );
}

function resumen(c: EstadoCentro) {
  if (c.tipo === 'externo') return `${c.en_proceso} en el proveedor · ${c.en_cola} listos para enviar · ${c.en_camino} por llegar`;
  const n = c.recursos.length;
  const quien = c.tipo === 'programacion' ? `${n} programador${n === 1 ? '' : 'es'}`
    : c.tipo === 'puesto' ? `${n} puesto${n === 1 ? '' : 's'}` : `${n} máquina${n === 1 ? '' : 's'}`;
  return `${c.horas_cola} h listas o en proceso · ${c.horas_total} h en total · ${c.capacidad_horas_dia} h/día ${n === 1 ? 'en' : 'entre'} ${quien}`;
}

function FilaMaquina({ m, sel, onClick }: { m: EstadoMaquina; sel: boolean; onClick: () => void }) {
  const prox = m.en_proceso[0] ?? m.cola[0] ?? m.proximas[0];
  return (
    <button className={`fila ${sel ? 'sel' : ''}`} onClick={onClick}>
      <span className="punto" style={{ background: colorSemaforo(m.semaforo) }} />
      <span className="nom" title={m.en_proceso.length ? `${m.nombre}: ${m.en_proceso.length} en proceso` : m.nombre}>
        {m.en_proceso.length > 0 && <i className="trabajando" aria-label="en proceso">▶ </i>}{m.nombre}
      </span>
      <span className="num">{m.cola.length}{m.proximas.length ? <small> +{m.proximas.length}</small> : null}</span>
      <span className="carga-celda">
        <span className="carga"><i style={{ width: `${Math.min(m.dias_carga / 3, 1) * 100}%`, background: colorSemaforo(m.semaforo) }} /></span>
        <span className="num">{m.dias_carga} d</span>
      </span>
      <span className="prox" title={prox?.proyecto}>{prox ? soCorto(prox.proyecto) : '—'}</span>
    </button>
  );
}

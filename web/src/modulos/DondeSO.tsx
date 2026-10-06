import { useMemo, useState } from 'react';
import type { EstadoPlanta, Operacion } from '../../../shared/tipos';
import { fecha } from '../formato';
import { LineaFases } from '../hud/LineaFases';
import { Cajon } from './Cajon';
import { FilaOperacion } from './FilaOperacion';

interface Resumen { so: string; cliente: string; ops: { o: Operacion; maquinaId: string | null; maquina: string }[] }

/** Agrupa todas las operaciones abiertas por SO (incluye las que no tienen máquina). */
export function indicePorSO(estado: EstadoPlanta): Map<string, Resumen> {
  const idx = new Map<string, Resumen>();
  const agregar = (o: Operacion, maquinaId: string | null, maquina: string) => {
    const r = idx.get(o.so) ?? { so: o.so, cliente: o.cliente, ops: [] };
    r.ops.push({ o, maquinaId, maquina });
    idx.set(o.so, r);
  };
  for (const m of estado.maquinas) for (const o of [...m.en_proceso, ...m.cola, ...m.por_liberar]) agregar(o, m.id, m.nombre);
  for (const o of estado.sin_maquina) agregar(o, null, o.maquina_zoho ? `Sin mapear: ${o.maquina_zoho}` : 'Sin máquina');
  return idx;
}

export function DondeSO({ estado, so, onSO, onIr, onCerrar }: {
  estado: EstadoPlanta; so: string | null; onSO: (so: string | null) => void;
  onIr: (maquinaId: string, opId: string) => void; onCerrar: () => void;
}) {
  const [q, setQ] = useState('');
  const indice = useMemo(() => indicePorSO(estado), [estado]);
  const candidatos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...indice.values()]
      .filter(r => !t || r.so.toLowerCase().includes(t) || r.cliente.toLowerCase().includes(t))
      .sort((a, b) => a.so.localeCompare(b.so, 'es', { numeric: true }));
  }, [indice, q]);
  const actual = so ? indice.get(so) : undefined;

  return (
    <Cajon titulo="¿Dónde está mi SO?" sub="Elige un SO para ver en qué máquinas está y en qué lugar de la cola" onCerrar={onCerrar}
      extra={
        <div className="cajon-busca">
          <input id="buscar-so" autoFocus placeholder="Número de SO o cliente…" value={q}
            onChange={e => { setQ(e.target.value); if (so) onSO(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && candidatos[0]) onSO(candidatos[0].so); }} />
        </div>
      }>
      {actual ? (
        <div className="so-detalle">
          <div className="so-cab">
            <div>
              <h3>{actual.so}</h3>
              <span className="sub">{actual.cliente || 'Cliente sin dato'} · entrega {fecha(actual.ops[0]?.o.fecha_entrega)}</span>
            </div>
            <button className="enlace" onClick={() => onSO(null)}>Cambiar</button>
          </div>
          <LineaFases fase={actual.ops[0].o.fase} />
          <h4>{actual.ops.length} operación{actual.ops.length === 1 ? '' : 'es'} abierta{actual.ops.length === 1 ? '' : 's'}</h4>
          {actual.ops.map(({ o, maquinaId, maquina }) => (
            <FilaOperacion key={o.id} o={o} maquina={maquina} mostrarSO={false}
              onClick={maquinaId ? () => onIr(maquinaId, o.id) : undefined} />
          ))}
          <p className="nota">Las máquinas del SO quedan resaltadas en la planta.</p>
        </div>
      ) : (
        <div className="so-lista">
          {candidatos.slice(0, 80).map(r => {
            const peor = r.ops.some(x => x.o.semaforo === 'rojo') ? 'rojo' : r.ops.some(x => x.o.semaforo === 'amarillo') ? 'amarillo' : 'verde';
            return (
              <button key={r.so} className="so-item" onClick={() => onSO(r.so)}>
                <span className="punto" style={{ background: `var(--${peor})` }} />
                <b className="so">{r.so}</b>
                <span className="cli">{r.cliente}</span>
                <span className="num">{r.ops.length} op.</span>
              </button>
            );
          })}
          {!candidatos.length && <p className="vacio">Ningún SO abierto coincide con “{q}”.</p>}
        </div>
      )}
    </Cajon>
  );
}

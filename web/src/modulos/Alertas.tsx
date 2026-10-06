import type { EstadoMaquina, Operacion } from '../../../shared/tipos';
import { Cajon } from './Cajon';
import { FilaOperacion } from './FilaOperacion';

export type Pestana = 'rojo' | 'amarillo';

export function Alertas({ maquinas, pestana, onPestana, onIr, onCerrar }: {
  maquinas: EstadoMaquina[]; pestana: Pestana; onPestana: (p: Pestana) => void;
  onIr: (maquinaId: string, opId: string) => void; onCerrar: () => void;
}) {
  const todas: { o: Operacion; m: EstadoMaquina }[] = maquinas.flatMap(m =>
    [...m.en_proceso, ...m.cola, ...m.por_liberar].map(o => ({ o, m })));
  const de = (s: Pestana) => todas.filter(x => x.o.semaforo === s)
    .sort((a, b) => (a.o.holgura_dias ?? 0) - (b.o.holgura_dias ?? 0) || a.o.so.localeCompare(b.o.so));
  const lista = de(pestana);

  return (
    <Cajon titulo="Alertas" sub="Operaciones que no llegan, o llegan justas, a su límite de producción" onCerrar={onCerrar}
      extra={
        <div className="segmentado" role="tablist">
          <button role="tab" aria-selected={pestana === 'rojo'} className={pestana === 'rojo' ? 'activo' : ''} onClick={() => onPestana('rojo')}>
            <span className="punto" style={{ background: 'var(--rojo)' }} /> Atrasadas <small>{de('rojo').length}</small>
          </button>
          <button role="tab" aria-selected={pestana === 'amarillo'} className={pestana === 'amarillo' ? 'activo' : ''} onClick={() => onPestana('amarillo')}>
            <span className="punto" style={{ background: 'var(--amarillo)' }} /> En riesgo <small>{de('amarillo').length}</small>
          </button>
        </div>
      }>
      {lista.map(({ o, m }) => <FilaOperacion key={o.id} o={o} maquina={m.nombre} onClick={() => onIr(m.id, o.id)} />)}
      {!lista.length && <p className="vacio">{pestana === 'rojo' ? 'No hay operaciones atrasadas.' : 'No hay operaciones en riesgo.'}</p>}
    </Cajon>
  );
}

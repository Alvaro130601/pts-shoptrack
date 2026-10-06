import type { Item, Operacion, SO } from '../../../shared/tipos';
import { Cajon } from './Cajon';
import { FilaItem } from './FilaItem';

export type Pestana = 'rojo' | 'amarillo';

const holgura = (i: Item) =>
  Math.min(...i.ruta.filter(o => o.estado !== 'hecha' && o.holgura_dias != null).map(o => o.holgura_dias!), 99);

/** Ítems que no llegan (o llegan justos) a la entrega con el plan actual, del más crítico al menos. */
export function Alertas({ sos, pestana, onPestana, onSO, onPaso, onCerrar }: {
  sos: SO[]; pestana: Pestana; onPestana: (p: Pestana) => void;
  onSO: (id: string) => void; onPaso: (o: Operacion) => void; onCerrar: () => void;
}) {
  const abiertos = sos.flatMap(so => so.items.filter(i => i.estado !== 'cerrado').map(i => ({ so, i })));
  const de = (s: Pestana) => abiertos.filter(x => x.i.semaforo === s)
    .sort((a, b) => holgura(a.i) - holgura(b.i) || a.so.fecha_entrega.localeCompare(b.so.fecha_entrega));
  const lista = de(pestana);

  return (
    <Cajon titulo="Alertas" sub="Ítems que con el plan actual no llegan, o llegan justos, a su entrega" onCerrar={onCerrar}
      extra={
        <div className="segmentado" role="tablist">
          <button role="tab" aria-selected={pestana === 'rojo'} className={pestana === 'rojo' ? 'activo' : ''} onClick={() => onPestana('rojo')}>
            <span className="punto" style={{ background: 'var(--rojo)' }} /> Atrasados <small>{de('rojo').length}</small>
          </button>
          <button role="tab" aria-selected={pestana === 'amarillo'} className={pestana === 'amarillo' ? 'activo' : ''} onClick={() => onPestana('amarillo')}>
            <span className="punto" style={{ background: 'var(--amarillo)' }} /> En riesgo <small>{de('amarillo').length}</small>
          </button>
        </div>
      }>
      {lista.map(({ so, i }) => <FilaItem key={i.id} so={so} item={i} onAbrir={() => onSO(so.id)} onPaso={onPaso} />)}
      {!lista.length && <p className="vacio">{pestana === 'rojo' ? 'Ningún ítem atrasado.' : 'Ningún ítem en riesgo.'}</p>}
    </Cajon>
  );
}

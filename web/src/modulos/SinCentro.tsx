import type { Operacion } from '../../../shared/tipos';
import { Cajon } from './Cajon';
import { FilaOperacion } from './FilaOperacion';

/** Operaciones cuyo equipo de Zoho no corresponde a ningún centro de config/centros.json. */
export function SinCentro({ ops, onCerrar }: { ops: Operacion[]; onCerrar: () => void }) {
  const grupos = new Map<string, Operacion[]>();
  for (const o of ops) {
    const k = o.equipo_zoho?.trim() || '(sin equipo asignado)';
    grupos.set(k, [...(grupos.get(k) ?? []), o]);
  }
  return (
    <Cajon titulo="Sin centro" sub="Operaciones con un equipo que ShopTrack no reconoce: no se reparten a ninguna máquina. Agrega el equipo en config/centros.json o corrígelo en Zoho." onCerrar={onCerrar}>
      {[...grupos].map(([equipo, lista]) => (
        <section key={equipo} className="grupo">
          <h4>Equipo en Zoho: <code>{equipo}</code> <small>{lista.length}</small></h4>
          {lista.map(o => <FilaOperacion key={o.id} o={o} />)}
        </section>
      ))}
      {!ops.length && <p className="vacio">Todas las operaciones tienen un proceso reconocido.</p>}
    </Cajon>
  );
}

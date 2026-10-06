import type { Operacion } from '../../../shared/tipos';
import { esFechaISO } from '../../../shared/reglas';
import { Cajon } from './Cajon';
import { FilaOperacion } from './FilaOperacion';

/** Bandeja de operaciones abiertas que no se pudieron ubicar: sin máquina reconocida o sin fecha válida. */
export function SinMaquina({ ops, onCerrar }: { ops: Operacion[]; onCerrar: () => void }) {
  const sinFecha = ops.filter(o => !esFechaISO(o.fecha_entrega));
  const sinMaq = ops.filter(o => esFechaISO(o.fecha_entrega));
  const grupos = new Map<string, Operacion[]>();
  for (const o of sinMaq) {
    const k = o.maquina_zoho?.trim() || '(vacío en Zoho)';
    grupos.set(k, [...(grupos.get(k) ?? []), o]);
  }
  return (
    <Cajon titulo="Sin máquina" sub="Operaciones abiertas que no aparecen en la planta. Corrige el dato en Zoho o en config/maquinas.json → zoho_nombre." onCerrar={onCerrar}>
      {[...grupos].map(([valor, lista]) => (
        <section key={valor} className="grupo">
          <h4>Valor en Zoho: <code>{valor}</code> <small>{lista.length}</small></h4>
          {lista.map(o => <FilaOperacion key={o.id} o={o} />)}
        </section>
      ))}
      {sinFecha.length > 0 && (
        <section className="grupo">
          <h4>Sin fecha de entrega válida <small>{sinFecha.length}</small></h4>
          {sinFecha.map(o => <FilaOperacion key={o.id} o={o} maquina={o.maquina_zoho ?? undefined} />)}
        </section>
      )}
      {!ops.length && <p className="vacio">Todas las operaciones abiertas tienen máquina y fecha. Nada pendiente aquí.</p>}
    </Cajon>
  );
}

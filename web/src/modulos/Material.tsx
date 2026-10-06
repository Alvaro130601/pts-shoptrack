import type { Operacion, SO } from '../../../shared/tipos';
import { estadoLargo, fecha } from '../formato';
import { Cajon } from './Cajon';
import { FilaItem } from './FilaItem';

/** Ítems esperando material, ordenados por la fecha en que el material hace falta. */
export function Material({ sos, onSO, onPaso, onCerrar }: {
  sos: SO[]; onSO: (id: string) => void; onPaso: (o: Operacion) => void; onCerrar: () => void;
}) {
  const lista = sos.flatMap(so => so.items.flatMap(i => {
    const paso = i.ruta.find(o => o.tipo === 'material' && o.estado !== 'hecha');
    return paso ? [{ so, i, paso }] : [];
  })).sort((a, b) => (a.paso.limite ?? '9999').localeCompare(b.paso.limite ?? '9999') || a.so.so.localeCompare(b.so.so));

  return (
    <Cajon titulo="Material" sub="Ítems que esperan material, del más urgente al menos. El plan supone que llega en 3 días hábiles." onCerrar={onCerrar}>
      {lista.map(({ so, i, paso }) => {
        const prog = i.ruta.find(o => o.tipo === 'programacion');
        const programa = !prog ? '' : prog.estado === 'hecha' ? ' · programa listo' : ` · programa: ${estadoLargo(prog).toLowerCase()}`;
        return (
          <FilaItem key={i.id} so={so} item={i} onAbrir={() => onSO(so.id)} onPaso={onPaso}
            nota={`Hace falta antes del ${fecha(paso.limite)}${programa}`} />
        );
      })}
      {!lista.length && <p className="vacio">Ningún ítem está esperando material.</p>}
    </Cajon>
  );
}

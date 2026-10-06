import type { EstadoOp, Operacion } from '../../../shared/tipos';
import { estadoLargo, etiquetaPaso, fecha } from '../formato';

const MARCA: Record<EstadoOp, string> = { hecha: '✓', en_proceso: '▶', en_cola: '●', en_camino: '○', bloqueada: '!', pendiente: '…' };

/** La ruta de un ítem como cadena de pasos, con el paso actual resaltado. Clic en un paso de máquina → ir a la
 *  máquina sugerida. */
export function RutaItem({ ruta, actual, onPaso, compacta }:
  { ruta: Operacion[]; actual?: string | null; onPaso?: (o: Operacion) => void; compacta?: boolean }) {
  return (
    <ol className={`ruta ${compacta ? 'compacta' : ''}`}>
      {ruta.map(o => {
        const clic = onPaso && o.estado !== 'hecha' && o.tipo === 'maquina' && o.maquina_id ? () => onPaso(o) : undefined;
        const titulo = `${o.nombre} · ${estadoLargo(o)}${o.fin_proyectado && o.estado !== 'hecha' ? ` · fin ${fecha(o.fin_proyectado)}` : ''}`;
        return (
          <li key={o.id} className={`paso ${o.estado} ${o.id === actual ? 'actual' : ''} sem-${o.estado === 'hecha' ? 'ok' : o.semaforo ?? 'no'}`}>
            <button type="button" onClick={clic} disabled={!clic} title={titulo}>
              <span className="marca" aria-hidden="true">{MARCA[o.estado]}</span>
              <span className="nom">{etiquetaPaso(o)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

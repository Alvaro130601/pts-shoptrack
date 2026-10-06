import type { Item, Operacion, SO } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { fecha, legible } from '../formato';
import { RutaItem } from './RutaItem';

/** Un ítem con su situación, su ruta y fechas. Se usa en Alertas y Material. */
export function FilaItem({ so, item, nota, onAbrir, onPaso }:
  { so: SO; item: Item; nota?: string; onAbrir?: () => void; onPaso?: (o: Operacion) => void }) {
  return (
    <div className="fila-item">
      <span className="barra-sem" style={{ background: colorSemaforo(item.semaforo) }} />
      <div className="fi-cuerpo">
        <button className="fi-cab" onClick={onAbrir} disabled={!onAbrir} title="Ver el SO completo">
          <b className="so">{so.so}</b>
          <span className="maq">{item.nombre}{item.cantidad ? ` · ${item.cantidad} u` : ''}</span>
          <span className="cli">{so.cliente}</span>
        </button>
        <span className="situacion">{item.situacion}</span>
        {nota && <span className="nota-item">{nota}</span>}
        {item.motivo && item.semaforo !== 'verde' && <span className="motivo">{legible(item.motivo)}</span>}
        <RutaItem ruta={item.ruta} actual={item.actual} onPaso={onPaso} compacta />
        <span className="op-l-meta">
          <span>Fin proyectado {fecha(item.fin_proyectado)}</span>
          <span>Límite {fecha(item.limite)}</span>
          <span>Entrega {fecha(so.fecha_entrega)}</span>
        </span>
      </div>
    </div>
  );
}

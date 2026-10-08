import type { Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { estadoLargo, etiquetaPaso, fecha, itemCorto, legible } from '../formato';

/** Fila compacta de una operación (colas de programación y proveedores, sin centro). */
export function FilaOperacion({ o, onClick }: { o: Operacion; onClick?: () => void }) {
  return (
    <button className="op-lista" onClick={onClick} disabled={!onClick}>
      <span className="barra-sem" style={{ background: colorSemaforo(o.semaforo) }} />
      <span className="op-l-cuerpo">
        <span className="op-l-arriba">
          <b className="so">{o.proyecto}</b>
          <span className="maq">{itemCorto(o)}</span>
          {!!o.ajustes?.length && <span className="tag-ajuste" title="Cambio del supervisor">ajustado</span>}
          <span className="estado">{estadoLargo(o)}</span>
        </span>
        <span className="desc">{etiquetaPaso(o)}{o.tipo === 'maquina' && o.nombre.includes('+') ? ' (con Set Up)' : ''} · {o.cliente}</span>
        {o.motivo && o.semaforo !== 'verde' && <span className="motivo">{legible(o.motivo)}</span>}
        <span className="op-l-meta">
          {(o.tipo === 'maquina' || o.tipo === 'programacion') && <span>{o.horas_pendientes} h</span>}
          {o.inicio_proyectado && <span>{fecha(o.inicio_proyectado)} → {fecha(o.fin_proyectado)}</span>}
          {o.limite && <span>Límite {fecha(o.limite)}</span>}
        </span>
      </span>
    </button>
  );
}

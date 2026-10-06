import type { Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { ESTADO_COLA, fecha, legible } from '../formato';

/** Fila compacta de una operación en listas transversales (alertas, SO, sin máquina). */
export function FilaOperacion({ o, maquina, onClick, mostrarSO = true }:
  { o: Operacion; maquina?: string; onClick?: () => void; mostrarSO?: boolean }) {
  return (
    <button className="op-lista" onClick={onClick} disabled={!onClick}>
      <span className="barra-sem" style={{ background: colorSemaforo(o.semaforo) }} />
      <span className="op-l-cuerpo">
        <span className="op-l-arriba">
          {mostrarSO && <b className="so">{o.so}</b>}
          {maquina && <span className="maq">{maquina}</span>}
          <span className="estado">{ESTADO_COLA[o.estado_cola]}{o.posicion ? ` · #${o.posicion}` : ''}</span>
        </span>
        <span className="desc">{o.descripcion}</span>
        {o.motivo && <span className="motivo">{legible(o.motivo)}</span>}
        <span className="op-l-meta">
          <span>{o.horas_pendientes} h</span>
          <span>Límite {fecha(o.fecha_limite_produccion)}</span>
          {o.fin_proyectado && <span>Fin proy. {fecha(o.fin_proyectado)}</span>}
          <span>Entrega {fecha(o.fecha_entrega)}</span>
        </span>
      </span>
    </button>
  );
}

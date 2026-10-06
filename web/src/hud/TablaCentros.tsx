import type { EstadoMaquina } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';

export function TablaCentros({ maquinas, seleccion, onSeleccionar }:
  { maquinas: EstadoMaquina[]; seleccion: string | null; onSeleccionar: (id: string) => void }) {
  const filas = [...maquinas].sort((a, b) => b.dias_carga - a.dias_carga);
  return (
    <div className="tabla tarjeta">
      <div className="tabla-cab">
        <b>Cola por centro de mecanizado</b>
        <span>ordenado por días de carga</span>
      </div>
      <div className="tabla-cuerpo">
        {filas.map(m => {
          const prox = m.en_proceso[0] ?? m.cola[0];
          return (
            <button key={m.id} className={`fila ${seleccion === m.id ? 'sel' : ''}`} onClick={() => onSeleccionar(m.id)}>
              <span className="punto" style={{ background: colorSemaforo(m.semaforo) }} />
              <span className="nom">{m.nombre}</span>
              <span className="num">▶ {m.en_proceso.length}</span>
              <span className="num">{m.cola.length} cola</span>
              <span className="carga"><i style={{ width: `${Math.min(m.dias_carga / 10, 1) * 100}%`, background: colorSemaforo(m.semaforo) }} /></span>
              <span className="num">{m.dias_carga} d</span>
              <span className="prox">{prox ? prox.so : '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

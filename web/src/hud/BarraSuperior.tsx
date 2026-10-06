import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EstadoPlanta } from '../../../shared/tipos';
import { IcoCampana, IcoCerrar, IcoLupa } from '../iconos';
import type { Modulo } from './MenuLateral';

interface Props {
  estado: EstadoPlanta | null;
  error: string | null;
  busqueda: string;
  onBusqueda: (q: string) => void;
  coincidencias: number | null; // máquinas que coinciden con búsqueda/filtro; null = sin filtro
  procesos: string[];
  proceso: string;
  onProceso: (p: string) => void;
  onAbrir: (m: Modulo, pestana?: 'rojo' | 'amarillo') => void;
  refBusqueda: RefObject<HTMLInputElement | null>;
}

export function BarraSuperior({ estado, error, busqueda, onBusqueda, coincidencias, procesos, proceso, onProceso, onAbrir, refBusqueda }: Props) {
  const k = estado?.kpis;
  const avisos = estado?.avisos ?? [];
  const [verAvisos, setVerAvisos] = useState(false);
  const refAvisos = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!verAvisos) return;
    const cerrar = (e: MouseEvent) => { if (!refAvisos.current?.contains(e.target as Node)) setVerAvisos(false); };
    document.addEventListener('pointerdown', cerrar);
    return () => document.removeEventListener('pointerdown', cerrar);
  }, [verAvisos]);

  return (
    <header className="barra tarjeta">
      <div className="marca">PTS <b>ShopTrack</b></div>

      <label className="buscador">
        <IcoLupa />
        <input ref={refBusqueda} id="busqueda" placeholder="Buscar SO, cliente, pieza o máquina"
          value={busqueda} onChange={e => onBusqueda(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { onBusqueda(''); e.currentTarget.blur(); } }} />
        {!busqueda && <kbd className="atajo" title="Atajo para buscar">/</kbd>}
        {coincidencias !== null && <span className="coinc">{coincidencias} máq.</span>}
        {busqueda && <button className="limpiar" onClick={() => onBusqueda('')} aria-label="Limpiar búsqueda"><IcoCerrar /></button>}
      </label>
      <select id="proceso" value={proceso} onChange={e => onProceso(e.target.value)} aria-label="Filtrar por proceso">
        <option value="todos">Todos los procesos</option>
        {procesos.map(p => <option key={p}>{p}</option>)}
      </select>

      {k && (
        <div className="kpis" role="group" aria-label="Resumen">
          <button className="kpi sec" onClick={() => onAbrir('cola')} title="SO con operaciones en máquina">
            <b>{k.so_abiertos}</b><span>SO abiertos</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('cola')} title="Operaciones mecanizándose ahora">
            <b className="azul">{k.en_proceso}</b><span>en proceso</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('cola')} title={`${k.por_liberar} más por liberar`}>
            <b>{k.en_cola}</b><span>en cola</span>
          </button>
          <button className="kpi sec" onClick={() => onAbrir('cola')} title="Horas pendientes en centros">
            <b>{k.horas_cola.toLocaleString('es-CR')}</b><span>h en cola</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('alertas', 'rojo')} title="Ver operaciones atrasadas">
            <b className={k.atrasadas ? 'rojo' : 'verde'}>{k.atrasadas}</b><span>atrasadas</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('alertas', 'amarillo')} title="Ver operaciones en riesgo">
            <b className={k.en_riesgo ? 'amarillo' : 'verde'}>{k.en_riesgo}</b><span>en riesgo</span>
          </button>
        </div>
      )}

      <div className="barra-der">
        <div className="avisos-ancla" ref={refAvisos}>
          <button className={`icono-btn ${error ? 'con-error' : ''}`} onClick={() => setVerAvisos(v => !v)}
            aria-label={`Avisos (${avisos.length + (error ? 1 : 0)})`} aria-expanded={verAvisos}>
            <IcoCampana />
            {(avisos.length > 0 || error) && <i className={`badge ${error ? 'rojo' : ''}`}>{avisos.length + (error ? 1 : 0)}</i>}
          </button>
          {verAvisos && (
            <div className="popover tarjeta" role="dialog" aria-label="Avisos">
              <b>Avisos</b>
              {error && <p className="err">{error}</p>}
              {avisos.map(a => <p key={a}>{a}</p>)}
              {!error && !avisos.length && <p className="vacio">Sin avisos.</p>}
            </div>
          )}
        </div>
        <div className={`fuente ${estado?.fuente ?? ''}`} title={estado ? `Actualizado ${new Date(estado.actualizado).toLocaleString('es-CR')}` : ''}>
          <span className="punto-vivo" />
          {estado ? (estado.fuente === 'zoho' ? 'Zoho' : 'Simulado') : 'Cargando…'}
          {estado && <span className="hora">{new Date(estado.actualizado).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </div>
    </header>
  );
}

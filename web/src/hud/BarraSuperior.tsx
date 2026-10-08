import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AccionFuente, EstadoPlanta } from '../../../shared/tipos';
import type { Filtros as F } from '../filtros';
import { IcoCampana, IcoCerrar, IcoLupa } from '../iconos';
import { Filtros } from './Filtros';
import type { Modulo } from './MenuLateral';

interface Props {
  estado: EstadoPlanta | null;
  error: string | null;
  busqueda: string;
  onBusqueda: (q: string) => void;
  coincidencias: number | null; // máquinas que coinciden con búsqueda/filtro; null = sin filtro
  procesos: { id: string; nombre: string }[];
  filtros: F;
  onFiltros: (f: F) => void;
  contar: (f: F) => number;   // máquinas que quedan con esos filtros
  onAbrir: (m: Modulo, pestana?: 'rojo' | 'amarillo') => void;
  refBusqueda: RefObject<HTMLInputElement | null>;
  /** Página publicada: leer Zoho (pide permiso) o abrir los permisos de la página. */
  onAccionFuente?: (a: AccionFuente) => void;
}

const SIN_FECHAS = 'Los SO no traen fecha de entrega: no hay semáforo';

export function BarraSuperior({ estado, error, busqueda, onBusqueda, coincidencias, procesos, filtros, onFiltros, contar, onAbrir, refBusqueda, onAccionFuente }: Props) {
  const k = estado?.kpis;
  const sinFechas = !!k && k.items_abiertos > 0 && k.items_con_fecha === 0;
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
      <Filtros filtros={filtros} onCambiar={onFiltros} procesos={procesos} contar={contar} sinSemaforo={sinFechas} />

      {k && (
        <div className="kpis" role="group" aria-label="Resumen">
          <button className="kpi sec" onClick={() => onAbrir('so')} title={`${k.items_abiertos} ítems abiertos`}>
            <b>{k.so_abiertos}</b><span>SO abiertos</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('cola')} title={`Operaciones en proceso en la planta: máquinas y programación${k.en_proveedor ? `. Aparte, ${k.en_proveedor} en servicio externo (no suman carga)` : ''}`}>
            <b className="azul">{k.en_proceso}</b><span>en proceso</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('cola')} title="Operaciones de máquina listas para empezar">
            <b>{k.en_cola}</b><span>en cola</span>
          </button>
          <button className="kpi sec" onClick={() => onAbrir('cola')} title="Horas de máquina en proceso o en cola">
            <b>{k.horas_cola.toLocaleString('es-CR')}</b><span>h en cola</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('material')} title="Ítems esperando material">
            <b className={k.esperando_material ? 'morado' : ''}>{k.esperando_material}</b><span>sin material</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('alertas', 'rojo')} title={sinFechas ? SIN_FECHAS : 'Ítems que no llegan a la entrega'}>
            <b className={sinFechas ? '' : k.atrasados ? 'rojo' : 'verde'}>{sinFechas ? '—' : k.atrasados}</b><span>atrasados</span>
          </button>
          <button className="kpi" onClick={() => onAbrir('alertas', 'amarillo')} title={sinFechas ? SIN_FECHAS : 'Ítems con 1 día de holgura o menos'}>
            <b className={sinFechas ? '' : k.en_riesgo ? 'amarillo' : 'verde'}>{sinFechas ? '—' : k.en_riesgo}</b><span>en riesgo</span>
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
        <Fuente estado={estado} onAccion={onAccionFuente} />
      </div>
    </header>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

/** De dónde vienen los datos: Zoho en vivo, una exportación a Excel (con su fecha) o datos simulados. */
function Fuente({ estado, onAccion }: { estado: EstadoPlanta | null; onAccion?: (a: AccionFuente) => void }) {
  if (!estado) return <div className="fuente"><span className="punto-vivo" />Cargando…</div>;
  const de = estado.datos_de ?? estado.actualizado;
  // Zoho pide permiso la primera vez: se lee al tocar el botón, no al abrir (el diálogo no tapa la planta de sorpresa).
  const accion = estado.accion_fuente;
  if (accion && onAccion) {
    return (
      <button type="button" className="fuente accion" onClick={() => onAccion(accion)}
        title={accion === 'conectar_zoho' ? 'Leer Zoho en vivo con tu conector Zoho Projects (la primera vez claude.ai pide permiso)' : 'Zoho está bloqueado para esta página: ábrelo en Permisos'}>
        <span className="punto-vivo" />{estado.fuente === 'zoho' ? 'Copia de Zoho' : 'Exportación'} {new Date(de).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
        <span className="nota">· {accion === 'conectar_zoho' ? 'Leer Zoho en vivo' : 'Permitir Zoho'}</span>
      </button>
    );
  }
  // En la página publicada: "leyendo Zoho…" mientras llega, o "sin Zoho" (el motivo está en los avisos).
  const nota = estado.nota_fuente && <span className="nota">· {estado.nota_fuente}</span>;
  if (estado.fuente === 'excel') {
    return (
      <div className="fuente excel" title={`Exportación de Zoho del ${new Date(de).toLocaleString('es-CR')}`}>
        <span className="punto-vivo" />Exportación
        <span className="hora">{new Date(de).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}{!nota && ` ${hora(de)}`}</span>
        {nota}
      </div>
    );
  }
  return (
    <div className={`fuente ${estado.fuente}`} title={`Leído ${new Date(de).toLocaleString('es-CR')}`}>
      <span className="punto-vivo" />{estado.fuente === 'zoho' ? 'Zoho' : 'Simulado'}
      <span className="hora">{hora(de)}</span>
      {nota}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDatos } from './api';
import { NOMBRE_FAMILIA } from './familias';
import { Planta, cajaDe, cajaPlanta } from './escena/Planta';
import type { CamaraApi } from './escena/Camara';
import { BarraSuperior } from './hud/BarraSuperior';
import { ControlesVista } from './hud/ControlesVista';
import { MenuLateral, type Modulo } from './hud/MenuLateral';
import { PanelMaquina } from './hud/PanelMaquina';
import { Alertas, type Pestana } from './modulos/Alertas';
import { ColaCentros } from './modulos/ColaCentros';
import { DondeSO } from './modulos/DondeSO';
import { Leyenda } from './modulos/Leyenda';
import { SinMaquina } from './modulos/SinMaquina';

const CLAVE_PISTA = 'shoptrack.pista-vista';
const leerPista = () => { try { return localStorage.getItem(CLAVE_PISTA) !== '1'; } catch { return true; } };
const ocultarPista = () => { try { localStorage.setItem(CLAVE_PISTA, '1'); } catch { /* sin almacenamiento */ } };

export default function App() {
  const { layout, estado, error } = useDatos();
  const [seleccion, setSeleccion] = useState<{ id: string; op?: string } | null>(null);
  const [modulo, setModulo] = useState<Modulo | null>(null);
  const [pestana, setPestana] = useState<Pestana>('rojo');
  const [soActivo, setSoActivo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [proceso, setProceso] = useState('todos');
  const [pista, setPista] = useState(leerPista);
  const camara = useRef<CamaraApi | null>(null);
  const refBusqueda = useRef<HTMLInputElement>(null);

  const maquinas = estado?.maquinas ?? [];
  const mapa = useMemo(() => new Map(maquinas.map(m => [m.id, m])), [maquinas]);
  const procesos = useMemo(() => [...new Set(maquinas.map(m => m.proceso ?? 'Sin proceso'))].sort(), [maquinas]);

  // Máquinas resaltadas en 3D: el SO elegido en "¿Dónde está mi SO?" manda; si no, búsqueda + filtro de proceso.
  const resaltadas = useMemo(() => {
    if (modulo === 'so' && soActivo) {
      return new Set(maquinas.filter(m => [...m.en_proceso, ...m.cola, ...m.por_liberar].some(o => o.so === soActivo)).map(m => m.id));
    }
    const q = busqueda.trim().toLowerCase();
    if (!q && proceso === 'todos') return null;
    return new Set(maquinas.filter(m =>
      (proceso === 'todos' || (m.proceso ?? 'Sin proceso') === proceso) &&
      (!q || `${m.nombre} ${NOMBRE_FAMILIA[m.familia ?? 'generica']}`.toLowerCase().includes(q) ||
        [...m.en_proceso, ...m.cola, ...m.por_liberar].some(o => `${o.so} ${o.cliente} ${o.descripcion}`.toLowerCase().includes(q))),
    ).map(m => m.id));
  }, [maquinas, busqueda, proceso, modulo, soActivo]);

  const encuadrarMaquinas = useCallback((ids: string[], margen: number, zoomMax = 46) => {
    const pts = (layout?.elementos ?? []).filter(e => ids.includes(e.id)).flatMap(e => e.footprint);
    // Tras el próximo render, cuando el cajón/panel ya ocupan su lugar y la cámara conoce el área libre.
    if (pts.length) requestAnimationFrame(() => camara.current?.encuadrar(cajaDe(pts, margen), zoomMax));
  }, [layout]);

  const seleccionar = useCallback((id: string | null, op?: string) => {
    setSeleccion(id ? { id, op } : null);
    if (id && pista) { setPista(false); ocultarPista(); }
  }, [pista]);

  /** Desde una lista: selecciona y lleva la cámara a la máquina. */
  const irA = useCallback((id: string, op?: string) => {
    seleccionar(id, op);
    encuadrarMaquinas([id], 1.2, 70);
  }, [seleccionar, encuadrarMaquinas]);

  const vistaGeneral = useCallback(() => {
    if (layout) requestAnimationFrame(() => camara.current?.encuadrar(cajaPlanta(layout)));
  }, [layout]);

  const abrir = (m: Modulo | null, p?: Pestana) => {
    setModulo(m);
    if (p) setPestana(p);
    if (m !== 'so') setSoActivo(null);
  };

  const elegirSO = (so: string | null) => {
    setSoActivo(so);
    if (!so || !estado) return;
    const ids = estado.maquinas.filter(m => [...m.en_proceso, ...m.cola, ...m.por_liberar].some(o => o.so === so)).map(m => m.id);
    encuadrarMaquinas(ids, 5);
  };

  // Teclado: "/" enfoca la búsqueda; Esc cierra el panel y luego el módulo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === '/' && !escribiendo) { e.preventDefault(); refBusqueda.current?.focus(); }
      if (e.key === 'Escape' && !escribiendo) {
        if (seleccion) setSeleccion(null);
        else if (modulo) abrir(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sel = seleccion ? mapa.get(seleccion.id) : undefined;
  // Debe coincidir con las medidas de estilos.css (--m, --menu, --cajon, --barra).
  const ocupado = { izq: 92 + (modulo ? 392 : 0), der: 12 + (seleccion ? 392 : 0), arr: 78, aba: 60 };
  const centros = maquinas.filter(m => m.es_centro_mecanizado && (!resaltadas || resaltadas.has(m.id)));
  const cerrar = () => abrir(null);

  return (
    <div className={`app ${modulo ? 'con-cajon' : ''} ${sel ? 'con-panel' : ''}`}>
      <div className="lienzo">
        {layout && <Planta layout={layout} maquinas={mapa} seleccion={seleccion?.id ?? null} resaltadas={resaltadas}
          onSeleccionar={id => seleccionar(id)} camara={camara} ocupado={ocupado} />}
      </div>

      <MenuLateral activo={modulo} onCambiar={m => abrir(m)} onInicio={() => { abrir(null); setSeleccion(null); vistaGeneral(); }}
        atrasadas={estado?.kpis.atrasadas ?? 0} sinMaquina={estado?.sin_maquina.length ?? 0} />

      <BarraSuperior estado={estado} error={error} busqueda={busqueda} onBusqueda={setBusqueda}
        coincidencias={resaltadas && modulo !== 'so' ? resaltadas.size : null}
        procesos={procesos} proceso={proceso} onProceso={setProceso} onAbrir={abrir} refBusqueda={refBusqueda} />

      {estado && modulo === 'cola' && <ColaCentros maquinas={centros} seleccion={seleccion?.id ?? null} onIr={id => irA(id)} onCerrar={cerrar} />}
      {estado && modulo === 'alertas' && <Alertas maquinas={maquinas} pestana={pestana} onPestana={setPestana} onIr={irA} onCerrar={cerrar} />}
      {estado && modulo === 'so' && <DondeSO estado={estado} so={soActivo} onSO={elegirSO} onIr={irA} onCerrar={cerrar} />}
      {estado && modulo === 'sin_maquina' && <SinMaquina ops={estado.sin_maquina} onCerrar={cerrar} />}
      {estado && modulo === 'leyenda' && <Leyenda maquinas={maquinas} onCerrar={cerrar} />}

      {sel && <PanelMaquina key={sel.id} m={sel} opInicial={seleccion?.op} onCerrar={() => setSeleccion(null)} />}

      {layout && (
        <div className="pie">
          <ControlesVista talleres={layout.talleres} onGeneral={vistaGeneral}
            onTaller={t => camara.current?.encuadrar(cajaDe(t.footprint, 0.5), 60)} onZoom={f => camara.current?.zoom(f)} />
          <div className="leyenda-mini tarjeta" aria-hidden="true">
            <span><i className="punto" style={{ background: 'var(--verde)' }} />A tiempo</span>
            <span><i className="punto" style={{ background: 'var(--amarillo)' }} />En riesgo</span>
            <span><i className="punto" style={{ background: 'var(--rojo)' }} />Atrasada</span>
            <span><i className="cuadro" style={{ background: 'var(--acento)' }} />En proceso</span>
            <span><i className="cuadro fantasma" />Por liberar</span>
          </div>
        </div>
      )}

      {pista && !sel && estado && (
        <div className="pista tarjeta">
          Haz clic en una máquina para ver su cola · arrastra para mover · rueda para acercar
          <button className="enlace" onClick={() => { setPista(false); ocultarPista(); }}>Entendido</button>
        </div>
      )}

      {!estado && !error && <div className="cargando">Cargando planta…</div>}
      {!estado && error && <div className="cargando err">No se pudieron cargar los datos: {error}</div>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useDatos } from './api';
import { Planta } from './escena/Planta';
import { Kpis } from './hud/Kpis';
import { PanelMaquina } from './hud/PanelMaquina';
import { TablaCentros } from './hud/TablaCentros';

export default function App() {
  const { layout, estado, error } = useDatos();
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [proceso, setProceso] = useState<string>('todos');

  const mapa = useMemo(() => new Map((estado?.maquinas ?? []).map(m => [m.id, m])), [estado]);
  const procesos = useMemo(() => [...new Set((estado?.maquinas ?? []).map(m => m.proceso ?? 'Sin proceso'))].sort(), [estado]);

  const resaltadas = useMemo(() => {
    if (!estado) return null;
    const q = busqueda.trim().toLowerCase();
    if (!q && proceso === 'todos') return null;
    return new Set(estado.maquinas.filter(m =>
      (proceso === 'todos' || (m.proceso ?? 'Sin proceso') === proceso) &&
      (!q || m.nombre.toLowerCase().includes(q) ||
        [...m.en_proceso, ...m.cola, ...m.por_liberar].some(o => (o.so + ' ' + o.cliente + ' ' + o.descripcion).toLowerCase().includes(q))),
    ).map(m => m.id));
  }, [estado, busqueda, proceso]);

  const sel = seleccion ? mapa.get(seleccion) : undefined;
  const visiblesTabla = (estado?.maquinas ?? []).filter(m => m.es_centro_mecanizado && (!resaltadas || resaltadas.has(m.id)));

  return (
    <div className="app">
      {layout && <Planta layout={layout} maquinas={mapa} seleccion={seleccion} resaltadas={resaltadas} onSeleccionar={setSeleccion} />}

      <div className="barra tarjeta">
        <div className="marca"><span className="logo">◆</span> PTS <b>ShopTrack</b></div>
        <input placeholder="Buscar SO, cliente, pieza o máquina…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select value={proceso} onChange={e => setProceso(e.target.value)}>
          <option value="todos">Todos los procesos</option>
          {procesos.map(p => <option key={p}>{p}</option>)}
        </select>
        <div className={`fuente ${estado?.fuente ?? ''}`}>
          <span className="punto-vivo" />
          {estado ? (estado.fuente === 'zoho' ? 'Zoho en vivo' : 'Datos simulados') : 'Cargando…'}
          {estado && <span className="hora">{new Date(estado.actualizado).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </div>

      {estado && <Kpis k={estado.kpis} />}
      {sel && <PanelMaquina key={sel.id} m={sel} onCerrar={() => setSeleccion(null)} />}
      {estado && <TablaCentros maquinas={visiblesTabla} seleccion={seleccion} onSeleccionar={setSeleccion} />}

      {(error || (estado?.avisos.length ?? 0) > 0) && (
        <div className="avisos">{error ? <p className="err">{error}</p> : estado!.avisos.map(a => <p key={a}>{a}</p>)}</div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Operacion, SO } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { fecha, legible } from '../formato';
import { Cajon } from './Cajon';
import { RutaItem } from './RutaItem';

/** Buscar un SO y ver cada ítem como su ruta de pasos: dónde está la pieza, qué falta y cuándo termina. */
export function DondeSO({ sos, so, onSO, onPaso, onCerrar }: {
  sos: SO[]; so: string | null; onSO: (id: string | null) => void;
  onPaso: (o: Operacion) => void; onCerrar: () => void;
}) {
  const [q, setQ] = useState('');
  const candidatos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sos
      .filter(s => !t || s.nombre.toLowerCase().includes(t) || s.cliente.toLowerCase().includes(t)
        || s.items.some(i => i.nombre.toLowerCase().includes(t)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  }, [sos, q]);
  const actual = so ? sos.find(s => s.id === so) : undefined;

  return (
    <Cajon titulo="¿Dónde está mi SO?" sub="Cada ítem con su ruta: ✓ hecho · ▶ en proceso · ● en cola · ○ en camino · ! bloqueado" onCerrar={onCerrar}
      extra={
        <div className="cajon-busca">
          <input id="buscar-so" autoFocus placeholder="Número de SO, cliente o ítem…" value={q}
            onChange={e => { setQ(e.target.value); if (so) onSO(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && candidatos[0]) onSO(candidatos[0].id); }} />
        </div>
      }>
      {actual ? (
        <div className="so-detalle">
          <div className="so-cab">
            <div>
              <h3>{actual.nombre}</h3>
              <span className="sub">{actual.cliente || 'Cliente sin dato'} · entrega {fecha(actual.fecha_entrega)} · fin proyectado {fecha(actual.fin_proyectado)}</span>
            </div>
            <button className="enlace" onClick={() => onSO(null)}>Cambiar</button>
          </div>
          <div className="so-estado">
            <span className={`estado-maq ${actual.semaforo ?? ''}`}><span className="punto" style={{ background: colorSemaforo(actual.semaforo) }} />{actual.etapa}</span>
            {actual.motivo && actual.semaforo !== 'verde' && <span className="motivo">{legible(actual.motivo)}</span>}
          </div>
          {actual.items.map(i => (
            <div key={i.id} className={`item-ruta ${i.estado === 'cerrado' ? 'cerrado' : ''}`}>
              <div className="ir-cab">
                <b>{i.nombre}</b>
                {i.cantidad && <span className="cant">{i.cantidad} u</span>}
                <span className="situacion">{i.situacion}</span>
                {i.semaforo && <span className="pill" style={{ background: colorSemaforo(i.semaforo) }}>{i.semaforo}</span>}
              </div>
              <RutaItem ruta={i.ruta} actual={i.actual} onPaso={onPaso} />
              {i.estado !== 'cerrado' && (
                <span className="op-l-meta"><span>Fin proyectado {fecha(i.fin_proyectado)}</span><span>Límite {fecha(i.limite)}</span></span>
              )}
            </div>
          ))}
          {actual.cierre.length > 0 && (
            <div className="item-ruta">
              <div className="ir-cab"><b>Cierre del SO</b></div>
              <RutaItem ruta={actual.cierre} />
            </div>
          )}
          <p className="nota">Clic en un paso de máquina para verlo en la planta. Las máquinas del SO quedan resaltadas.</p>
          {actual.url_zoho && <a className="enlace" href={actual.url_zoho} target="_blank" rel="noreferrer">Abrir en Zoho ↗</a>}
        </div>
      ) : (
        <div className="so-lista">
          {candidatos.slice(0, 100).map(s => (
            <button key={s.id} className="so-item" onClick={() => onSO(s.id)}>
              <span className="punto" style={{ background: colorSemaforo(s.semaforo) }} />
              <b className="so">{s.nombre}</b>
              <span className="cli">{s.cliente}</span>
              <span className="num">{s.etapa} · {s.items.length} ít.</span>
            </button>
          ))}
          {!candidatos.length && <p className="vacio">Ningún SO abierto coincide con “{q}”.</p>}
        </div>
      )}
    </Cajon>
  );
}

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { AjusteEstado, Operacion, SO } from '../../../shared/tipos';
import type { Backend } from '../backend';
import { colorSemaforo } from '../colores';
import { fecha, legible } from '../formato';
import type { Chat } from './Asistente';
import { Cajon } from './Cajon';
import { RutaItem } from './RutaItem';

/** Buscar un SO y ver cada ítem como su ruta de pasos: dónde está la pieza, qué falta y cuándo termina. */
export function DondeSO({ sos, so, onSO, onPaso, onCerrar, chat, backend, ajustes, onQuitarAjuste, onVerAsistente, enfocar }: {
  sos: SO[]; so: string | null; onSO: (id: string | null) => void;
  onPaso: (o: Operacion) => void; onCerrar: () => void;
  chat: Chat; backend: Backend; ajustes: AjusteEstado[]; onQuitarAjuste: (id: string) => Promise<void>; onVerAsistente: () => void;
  enfocar?: number;   // cambia cuando se pide comentar este SO desde otro panel
}) {
  const refComentario = useRef<HTMLTextAreaElement>(null);
  const comentar = () => { refComentario.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); refComentario.current?.focus(); };
  useEffect(() => { if (enfocar) setTimeout(comentar, 50); }, [enfocar, so]);
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
          <div className="so-acciones">
            <button type="button" className="boton chico primario" onClick={comentar}>Comentar</button>
            {actual.url_zoho && <a className="boton chico" href={actual.url_zoho} target="_blank" rel="noreferrer">Abrir en Zoho ↗</a>}
          </div>
          <ComentarioSO so={actual} chat={chat} backend={backend} onVerAsistente={onVerAsistente} refTexto={refComentario} />
          <CambiosSO so={actual} ajustes={ajustes} onQuitar={onQuitarAjuste} />
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

/** Comentario en palabras para este SO ("cerrar el fresado del ítem 2", "prioridad 1", "llegó el material"). Lo
 *  interpreta el asistente y lo aplica como cambio del supervisor: queda en ShopTrack, no en Zoho, y se puede quitar. */
function ComentarioSO({ so, chat, backend, onVerAsistente, refTexto }: {
  so: SO; chat: Chat; backend: Backend; onVerAsistente: () => void; refTexto: RefObject<HTMLTextAreaElement | null>;
}) {
  const [texto, setTexto] = useState('');
  const [enviado, setEnviado] = useState<string | null>(null);
  const [disponible, setDisponible] = useState<true | string | null>(null);
  useEffect(() => {
    let vivo = true;
    backend.asistente().then(d => vivo && setDisponible(d));
    return () => { vivo = false; };
  }, [backend]);
  useEffect(() => { setEnviado(null); setTexto(''); }, [so.id]);

  let i = -1;
  if (enviado) chat.mensajes.forEach((m, k) => { if (m.rol === 'usuario' && m.texto === enviado) i = k; });
  const respuesta = i >= 0 ? chat.mensajes[i + 1] : undefined;
  const listo = disponible === true;
  const enviar = () => {
    const t = texto.trim();
    if (!t || chat.ocupado || !listo) return;
    const mensaje = `Sobre el ${so.nombre}: ${t}`;
    setEnviado(mensaje); setTexto('');
    chat.enviar(mensaje);
  };
  return (
    <section className="so-instruccion">
      <h4>Comentario para este SO</h4>
      <form onSubmit={e => { e.preventDefault(); enviar(); }} className="chat-entrada">
        <textarea id="so-comentario" ref={refTexto} rows={2} value={texto} disabled={!listo} aria-label={`Comentario para ${so.nombre}`}
          placeholder="Ej.: cerrar el fresado del ítem 2 · ponerlo de prioridad 1 · llegó el material"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        {chat.ocupado
          ? <button type="button" className="boton" onClick={chat.detener}>Detener</button>
          : <button type="submit" className="boton primario" disabled={!listo || !texto.trim()}>Comentar</button>}
      </form>
      {disponible !== true && <p className="chat-aviso">{disponible ?? 'Conectando con Claude…'}</p>}
      {respuesta && (
        <div className={`burbuja asistente ${respuesta.estado}`} aria-live="polite">
          {respuesta.actividad.length > 0 && (
            <ul className="actividad">{respuesta.actividad.map((a, k) => <li key={k} className={a.error ? 'error' : ''}>{a.texto}</li>)}</ul>
          )}
          {respuesta.texto ? <p className="texto">{respuesta.texto}</p> : respuesta.estado === 'pensando' && <p className="pensando">Pensando…</p>}
          {respuesta.error && <p className="chat-error">{respuesta.error}</p>}
        </div>
      )}
      <p className="nota">El asistente lee el comentario y aplica el cambio en ShopTrack para todos (no se escribe en Zoho); se puede quitar abajo.
        {respuesta && <> <button type="button" className="enlace" onClick={onVerAsistente}>Ver la conversación</button></>}</p>
    </section>
  );
}

/** Cambios del supervisor que tocan este SO (su descripción empieza con el número de SO). */
function CambiosSO({ so, ajustes, onQuitar }: { so: SO; ajustes: AjusteEstado[]; onQuitar: (id: string) => Promise<void> }) {
  const [quitando, setQuitando] = useState<string | null>(null);
  const suyos = ajustes.filter(a => a.descripcion === so.nombre || a.descripcion.startsWith(`${so.nombre} `));
  if (!suyos.length) return null;
  const quitar = async (id: string) => { setQuitando(id); try { await onQuitar(id); } finally { setQuitando(null); } };
  return (
    <section>
      <h4>Cambios en este SO</h4>
      <div className="cambios">
        {[...suyos].reverse().map(a => (
          <div key={a.id} className={`cambio ${a.aplicado ? '' : 'sin-aplicar'}`}>
            <div className="cambio-cab">
              <span className="cambio-desc">{a.descripcion}</span>
              <button type="button" className="enlace" disabled={quitando === a.id} onClick={() => quitar(a.id)}>Quitar</button>
            </div>
            {a.nota && <span className="cambio-nota">{a.nota}</span>}
            {!a.aplicado && <span className="cambio-motivo">Sin aplicar: {a.motivo}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

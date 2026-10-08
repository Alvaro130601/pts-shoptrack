import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventoAsistente } from '../../../shared/asistente';
import type { AjusteEstado, EstadoPlanta, TipoAjuste } from '../../../shared/tipos';
import type { Backend, Turno } from '../backend';
import { Cajon } from './Cajon';

export interface Mensaje {
  id: number;
  rol: Turno['rol'];
  texto: string;
  actividad: { texto: string; error?: boolean }[];
  estado: 'pensando' | 'escribiendo' | 'listo' | 'error';
  error?: string;
}

/** Estado de la conversación. Vive en App para que no se pierda al cerrar el cajón. */
export function useChat(backend: Backend, onCambio: () => void) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [conversacion, setConversacion] = useState<string>();
  const [control, setControl] = useState<AbortController | null>(null);
  const siguiente = useRef(1);

  const enviar = useCallback(async (texto: string) => {
    if (control) return;
    const historial: Turno[] = mensajes.filter(m => m.estado !== 'error' || m.texto).map(m => ({ rol: m.rol, texto: m.texto }));
    const idU = siguiente.current++, idA = siguiente.current++;
    setMensajes(ms => [...ms,
      { id: idU, rol: 'usuario', texto, actividad: [], estado: 'listo' },
      { id: idA, rol: 'asistente', texto: '', actividad: [], estado: 'pensando' }]);
    const ctl = new AbortController();
    setControl(ctl);
    const editar = (f: (m: Mensaje) => Mensaje) => setMensajes(ms => ms.map(m => (m.id === idA ? f(m) : m)));
    const onEvento = (e: EventoAsistente) => {
      if (e.tipo === 'texto') editar(m => ({ ...m, texto: m.texto + e.delta, estado: 'escribiendo' }));
      else if (e.tipo === 'herramienta') editar(m => ({ ...m, actividad: [...m.actividad, { texto: e.resumen, error: e.error }] }));
      else if (e.tipo === 'cambio') onCambio();
      else if (e.tipo === 'fin') { setConversacion(e.conversacion); editar(m => ({ ...m, texto: m.texto.trim(), estado: 'listo' })); }
      else if (e.tipo === 'error') editar(m => ({ ...m, estado: 'error', error: e.mensaje }));
    };
    try {
      await backend.preguntar({ mensaje: texto, conversacion, historial, onEvento, signal: ctl.signal });
      editar(m => (m.estado === 'pensando' || m.estado === 'escribiendo' ? { ...m, estado: 'listo' } : m));
    } catch (err) {
      const detenido = ctl.signal.aborted;
      editar(m => ({ ...m, estado: detenido && m.texto ? 'listo' : 'error', error: detenido ? 'Detenido.' : (err as Error).message }));
    } finally {
      setControl(null);
      onCambio();
    }
  }, [backend, control, conversacion, mensajes, onCambio]);

  return {
    mensajes, ocupado: !!control, enviar,
    detener: () => control?.abort(),
    nueva: () => { if (!control) { setMensajes([]); setConversacion(undefined); } },
  };
}
export type Chat = ReturnType<typeof useChat>;

const TIPO: Record<TipoAjuste, string> = {
  estado: 'Estado', material: 'Material', prioridad: 'Prioridad', entrega: 'Entrega', maquina: 'Máquina', fuera_servicio: 'Fuera de servicio',
};

/** Ejemplos con datos de hoy, para que se entienda qué se le puede pedir. */
function sugerencias(e: EstadoPlanta): string[] {
  const maq = [...e.maquinas].filter(m => m.cola.length).sort((a, b) => b.horas_cola - a.horas_cola);
  const cargada = maq[0];
  const so = cargada?.cola[0]?.proyecto ?? e.sos[0]?.nombre;
  const otra = maq.find(m => m.id !== cargada?.id && m.es_centro_mecanizado);
  return [
    cargada && `¿Qué hay en cola en ${cargada.nombre}?`,
    so && `Pon la ${so} como prioridad 1`,
    otra && `${otra.nombre} está en mantenimiento hasta mañana`,
    e.kpis.esperando_material ? '¿Qué ítems siguen esperando material?' : '¿Qué proceso está más cargado?',
  ].filter((s): s is string => !!s);
}

const haceCuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' });
};

export function Asistente({ chat, estado, backend, onCambio, onCerrar }: {
  chat: Chat; estado: EstadoPlanta; backend: Backend; onCambio: () => void; onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<'chat' | 'cambios'>('chat');
  const [entrada, setEntrada] = useState('');
  const [disponible, setDisponible] = useState<true | string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const refEntrada = useRef<HTMLTextAreaElement>(null);
  const ejemplos = useMemo(() => sugerencias(estado), [estado]);

  useEffect(() => {
    let vivo = true;
    backend.asistente().then(d => vivo && setDisponible(d));
    return () => { vivo = false; };
  }, [backend]);
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [chat.mensajes]);
  useEffect(() => { if (pestana === 'chat') refEntrada.current?.focus(); }, [pestana, disponible]);

  const listo = disponible === true;
  const enviar = (texto = entrada) => {
    const t = texto.trim();
    if (!t || chat.ocupado || !listo) return;
    setEntrada('');
    chat.enviar(t);
  };
  const quitar = async (a: AjusteEstado) => {
    setQuitando(a.id);
    try { await backend.quitarAjuste(a.id); } finally { setQuitando(null); onCambio(); }
  };

  return (
    <Cajon titulo="Asistente" onCerrar={onCerrar}
      sub="Pídele cambios al plan con tus palabras. Quedan en ShopTrack, no en Zoho, y se pueden quitar."
      extra={
        <div className="segmentado" role="tablist" aria-label="Asistente">
          <button role="tab" aria-selected={pestana === 'chat'} className={pestana === 'chat' ? 'activo' : ''} onClick={() => setPestana('chat')}>Conversación</button>
          <button role="tab" aria-selected={pestana === 'cambios'} className={pestana === 'cambios' ? 'activo' : ''} onClick={() => setPestana('cambios')}>
            Cambios <small>{estado.ajustes.length}</small>
          </button>
        </div>
      }
      pie={pestana === 'chat' && (
        <form className="chat-pie" onSubmit={e => { e.preventDefault(); enviar(); }}>
          {disponible !== true && <p className="chat-aviso">{disponible ?? 'Conectando con Claude…'}</p>}
          <div className="chat-entrada">
            <textarea id="asistente-mensaje" ref={refEntrada} rows={2} value={entrada} disabled={!listo}
              placeholder="Ej.: la Haas VF-2 está en mantenimiento hasta el jueves" aria-label="Mensaje para el asistente"
              onChange={e => setEntrada(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            {chat.ocupado
              ? <button type="button" className="boton" onClick={chat.detener}>Detener</button>
              : <button type="submit" className="boton primario" disabled={!listo || !entrada.trim()}>Enviar</button>}
          </div>
          {chat.mensajes.length > 0 && !chat.ocupado && <button type="button" className="enlace" onClick={chat.nueva}>Nueva conversación</button>}
        </form>
      )}>
      {pestana === 'chat' ? (
        <div className="chat" aria-live="polite">
          {!chat.mensajes.length && (
            <div className="chat-vacio">
              <p>Puede consultar la carga y la cola de cada máquina, y cambiar el plan: estados, llegada de material,
                prioridad o fecha de un SO, en qué máquina va una operación y máquinas fuera de servicio.</p>
              <p className="chat-vacio-tit">Prueba con</p>
              {ejemplos.map(s => (
                <button key={s} type="button" className="sugerencia" disabled={!listo} onClick={() => enviar(s)}>{s}</button>
              ))}
            </div>
          )}
          {chat.mensajes.map(m => m.rol === 'usuario' ? (
            <div key={m.id} className="burbuja usuario">{m.texto}</div>
          ) : (
            <div key={m.id} className={`burbuja asistente ${m.estado}`}>
              {m.actividad.length > 0 && (
                <ul className="actividad">
                  {m.actividad.map((a, i) => <li key={i} className={a.error ? 'error' : ''}>{a.texto}</li>)}
                </ul>
              )}
              {m.texto ? <p className="texto">{m.texto}</p> : m.estado === 'pensando' && <p className="pensando">Pensando…</p>}
              {m.error && <p className="chat-error">{m.error}</p>}
            </div>
          ))}
          <div ref={fin} />
        </div>
      ) : (
        <div className="cambios">
          {!estado.ajustes.length && <p className="vacio">No hay cambios del supervisor. Lo que le pidas al asistente aparece aquí y se puede quitar.</p>}
          {[...estado.ajustes].reverse().map(a => (
            <div key={a.id} className={`cambio ${a.aplicado ? '' : 'sin-aplicar'}`}>
              <div className="cambio-cab">
                <span className="cambio-tipo">{TIPO[a.tipo]}</span>
                <span className="cambio-meta">{haceCuanto(a.creado)}</span>
                <button type="button" className="enlace" disabled={quitando === a.id} onClick={() => quitar(a)}>Quitar</button>
              </div>
              <span className="cambio-desc">{a.descripcion}</span>
              {a.nota && <span className="cambio-nota">{a.nota}</span>}
              {!a.aplicado && <span className="cambio-motivo">Sin aplicar: {a.motivo}</span>}
            </div>
          ))}
          {estado.ajustes.length > 0 && <p className="nota">Quitar un cambio devuelve el plan a lo que dicen los datos de Zoho.</p>}
        </div>
      )}
    </Cajon>
  );
}

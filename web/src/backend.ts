// De dónde saca la app sus datos y a quién le habla el asistente: el servidor de ShopTrack (uso normal en planta)
// o la página publicada en claude.ai, que arma el plan en el navegador (backend-pagina.ts).
import type { EventoAsistente } from '../../shared/asistente';
import type { EstadoPlanta } from '../../shared/tipos';
import type { Layout } from './tipos-layout';

export interface Turno { rol: 'usuario' | 'asistente'; texto: string }

export interface Pregunta {
  mensaje: string;
  conversacion?: string;     // servidor: id que llegó en el evento 'fin' anterior
  historial: Turno[];        // página publicada: la conversación la guarda la página
  onEvento: (e: EventoAsistente) => void;
  signal: AbortSignal;
}

export interface Backend {
  layout(): Promise<Layout>;
  estado(): Promise<EstadoPlanta>;
  quitarAjuste(id: string): Promise<void>;
  /** true si el asistente se puede usar; si no, el motivo para mostrarle al supervisor. */
  asistente(): Promise<true | string>;
  preguntar(p: Pregunta): Promise<void>;
  /** Avisa cuando el plan cambió por fuera (otro supervisor hizo un ajuste). Devuelve cómo dejar de escuchar. */
  alCambiar(fn: () => void): () => void;
  /** Cada cuánto releer el estado (los datos de Zoho cambian solos). 0 = no hace falta. */
  refrescoMs: number;
}

async function json<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

export const backendServidor: Backend = {
  refrescoMs: 60_000,
  layout: () => fetch('/api/layout').then(r => json<Layout>(r)),
  estado: () => fetch('/api/estado').then(r => json<EstadoPlanta>(r)),
  async quitarAjuste(id) {
    await json(await fetch(`/api/ajustes/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
  async asistente() {
    const s = await fetch('/api/salud').then(r => r.json()).catch(() => null) as { asistente?: boolean } | null;
    if (!s) return 'No hay conexión con el servidor de ShopTrack.';
    return s.asistente ? true : 'El asistente necesita una clave de Claude en el servidor: agrega ANTHROPIC_API_KEY en el archivo .env y reinicia ShopTrack.';
  },
  async preguntar(p) {
    const r = await fetch('/api/asistente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: p.signal,
      body: JSON.stringify({ mensaje: p.mensaje, conversacion: p.conversacion }),
    });
    if (!r.ok || !r.body) await json(r);
    // Una línea JSON por evento (NDJSON), a medida que Claude escribe y usa herramientas.
    const lector = r.body!.pipeThrough(new TextDecoderStream()).getReader();
    let resto = '';
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      const lineas = (resto + value).split('\n');
      resto = lineas.pop() ?? '';
      for (const l of lineas) if (l.trim()) p.onEvento(JSON.parse(l) as EventoAsistente);
    }
    if (resto.trim()) p.onEvento(JSON.parse(resto) as EventoAsistente);
  },
  alCambiar: () => () => {},
};

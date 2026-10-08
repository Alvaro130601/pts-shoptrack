// Conversación con Claude para el asistente de planificación. Claude usa las herramientas de shared/asistente.ts;
// los cambios se guardan como ajustes del supervisor (no se escribe en Zoho). La historia de cada conversación se
// guarda en memoria y solo se le agregan mensajes (nunca se edita), como pide la API con el razonamiento activado.
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock, BetaMessage, BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ErrorHerramienta, HERRAMIENTAS, INSTRUCCIONES, contextoPlanta, ejecutarHerramienta, type Contexto, type EventoAsistente,
} from '../shared/asistente.ts';
import type { Ajuste } from '../shared/tipos.ts';

export const MODELO = process.env.ASISTENTE_MODELO || 'claude-opus-5-5';
// Pedidos cortos de chat con herramientas simples: esfuerzo bajo responde rápido; subir si se equivoca de operación.
const ESFUERZO = (process.env.ASISTENTE_ESFUERZO || 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const MAX_VUELTAS = 8;
const VIDA_CONVERSACION_MS = 2 * 3600_000;

/** ¿Hay credenciales de Claude? (clave en .env, token o un perfil de `ant auth login`). */
export const hayCredenciales = () =>
  !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE ||
    existsSync(join(homedir(), '.config', 'anthropic')));

export const SIN_CREDENCIALES = 'El asistente necesita una clave de Claude: agrega ANTHROPIC_API_KEY en el archivo .env y reinicia ShopTrack.';

const conversaciones = new Map<string, { mensajes: BetaMessageParam[]; t: number }>();

const TOOLS = HERRAMIENTAS.map(h => ({
  name: h.name, description: h.description, input_schema: h.input_schema,
  eager_input_streaming: true, // la respuesta va en streaming: las entradas se validan en ejecutarHerramienta
}));

export interface Pedido {
  cliente: Anthropic;
  conversacion?: string;
  mensaje: string;
  /** Plan y ajustes vigentes en este momento (cambian después de cada herramienta que escribe). */
  contexto: () => Contexto;
  /** Guarda la lista nueva de ajustes y recalcula el plan. */
  guardar: (ajustes: Ajuste[]) => Promise<void>;
  emitir: (e: EventoAsistente) => void;
  signal?: AbortSignal;
}

/** Un turno de conversación: manda el pedido, corre las herramientas que Claude pida y emite eventos para la UI. */
export async function conversar(p: Pedido): Promise<void> {
  limpiar();
  const id = p.conversacion && conversaciones.has(p.conversacion) ? p.conversacion : `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const conv = conversaciones.get(id) ?? { mensajes: [], t: Date.now() };
  conversaciones.set(id, conv);
  // El contexto (fecha, carga, ajustes) va con cada mensaje del supervisor, no en las instrucciones: así las
  // instrucciones y las herramientas no cambian y quedan en caché.
  conv.mensajes.push({ role: 'user', content: [
    { type: 'text', text: `<contexto>\n${contextoPlanta(p.contexto().estado)}\n</contexto>` },
    { type: 'text', text: p.mensaje },
  ] });

  let reintentos = 0;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = p.cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      system: INSTRUCCIONES,
      tools: TOOLS,
      messages: conv.mensajes,
      thinking: { type: 'adaptive' },
      output_config: { effort: ESFUERZO },
      cache_control: { type: 'ephemeral' },
      // Si el modelo declina por política, el servidor reintenta con su modelo de respaldo por defecto.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { signal: p.signal });
    stream.on('text', delta => p.emitir({ tipo: 'texto', delta }));

    let msg: BetaMessage;
    try {
      msg = await stream.finalMessage();
      reintentos = 0;
    } catch (err) {
      // Con eager_input_streaming, una entrada de herramienta que no es JSON rechaza aquí: se repite el turno.
      // Los errores de la API (clave, límites, red) suben.
      if (err instanceof Anthropic.APIError || reintentos++ >= 2) throw err;
      vuelta--;
      continue;
    }
    conv.mensajes.push({ role: 'assistant', content: msg.content });
    conv.t = Date.now();

    if (msg.stop_reason === 'refusal') {
      p.emitir({ tipo: 'texto', delta: '\n\nNo puedo ayudar con ese pedido.' });
      break;
    }
    const usos = msg.content.filter((b: BetaContentBlock): b is BetaToolUseBlock => b.type === 'tool_use');
    if (!usos.length) break;

    const resultados: BetaToolResultBlockParam[] = [];
    for (const u of usos) {
      // Una entrada cortada por max_tokens puede parecer un objeto válido: no se ejecuta.
      if (msg.stop_reason === 'max_tokens') {
        resultados.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'La entrada llegó incompleta (límite de tokens); repite la llamada.' });
        continue;
      }
      try {
        const r = ejecutarHerramienta(u.name, u.input, p.contexto());
        if (r.ajustes) {
          await p.guardar(r.ajustes);
          p.emitir({ tipo: 'cambio' });
        }
        p.emitir({ tipo: 'herramienta', nombre: u.name, resumen: r.resumen });
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r.resultado) });
      } catch (e) {
        const mensaje = e instanceof ErrorHerramienta ? e.message : `Error al ejecutar ${u.name}: ${(e as Error).message}`;
        p.emitir({ tipo: 'herramienta', nombre: u.name, resumen: mensaje, error: true });
        resultados.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: mensaje });
      }
    }
    conv.mensajes.push({ role: 'user', content: resultados });
  }
  p.emitir({ tipo: 'fin', conversacion: id });
}

/** Mensaje para el supervisor según el error de la API. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return `La clave de Claude no es válida o no tiene permiso. ${SIN_CREDENCIALES}`;
  if (err instanceof Anthropic.RateLimitError) return 'Claude está ocupado o se alcanzó el límite de uso. Intenta de nuevo en un momento.';
  if (err instanceof Anthropic.APIUserAbortError) return 'Pedido cancelado.';
  if (err instanceof Anthropic.APIConnectionError) return 'No hay conexión con Claude (revisa internet o el proxy).';
  if (err instanceof Anthropic.APIError) return `Claude respondió con un error (${err.status ?? 'sin código'}). Intenta de nuevo.`;
  return `Error del asistente: ${(err as Error)?.message ?? err}`;
}

function limpiar() {
  const ahora = Date.now();
  for (const [id, c] of conversaciones) if (ahora - c.t > VIDA_CONVERSACION_MS) conversaciones.delete(id);
}

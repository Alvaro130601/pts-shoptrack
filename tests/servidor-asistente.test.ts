import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import { INSTRUCCIONES, type EventoAsistente } from '../shared/asistente.ts';
import { armarEstado } from '../shared/plan.ts';
import type { Ajuste, CentroConfig, MaquinaConfig, ProyectoCrudo, ReglasLectura } from '../shared/tipos.ts';
import { conversar } from '../server/asistente.ts';

const reglas = mapeo.lectura as ReglasLectura;
const MAQUINAS: MaquinaConfig[] = [{ id: 'haas', nombre: 'Haas #1', taller: null, proceso: null, capacidad_horas_dia: 8, es_centro_mecanizado: true, activa: true }];
const CENTROS: CentroConfig[] = [{ id: 'cnc', nombre: 'Fresado CNC', tipo: 'maquina', equipos_zoho: ['Fresado CNC'], maquinas: ['haas'] }];
const PROYECTOS: ProyectoCrudo[] = ['SO-501-XYZ-1', 'SO-502-XYZ-1'].map((nombre, k) => ({
  id: nombre, nombre, estado: 'Activo', cliente: 'XYZ', fecha_entrega: '',
  listas: [{ id: `l${k}`, nombre: 'Ítem 1 (1 unidad)', tareas: [{ id: `t${k}`, nombre: 'H. Fresado CNC', equipo: 'Fresado CNC', estado: 'Pendiente', horas_estimadas: 8, horas_registradas: 0 }] }],
}));
const armar = (ajustes: Ajuste[]) => armarEstado({
  proyectos: PROYECTOS, maquinas: MAQUINAS, centros: CENTROS, reglas, fuente: 'excel', hoy: '2026-10-05', feriados: new Set(), ajustes,
});

type Bloque = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
/** Cliente falso: devuelve las respuestas del guion en orden y guarda lo que recibió. */
function clienteFalso(guion: { stop_reason: string; content: Bloque[] }[]) {
  const pedidos: Record<string, unknown>[] = [];
  const cliente = {
    beta: { messages: { stream(params: Record<string, unknown>) {
      pedidos.push(structuredClone(params));
      const msg = guion.shift()!;
      const alTexto: ((d: string) => void)[] = [];
      return {
        on(evento: string, fn: (d: string) => void) { if (evento === 'text') alTexto.push(fn); return this; },
        async finalMessage() {
          for (const b of msg.content) if (b.type === 'text') alTexto.forEach(f => f(b.text));
          return { id: 'msg', role: 'assistant', model: 'claude-opus-5-5', ...msg };
        },
      };
    } } },
  };
  return { cliente: cliente as unknown as Anthropic, pedidos };
}

function sesion() {
  let ajustes: Ajuste[] = [];
  const eventos: EventoAsistente[] = [];
  return {
    eventos, ajustes: () => ajustes,
    base: {
      contexto: () => ({ estado: armar(ajustes), ajustes, replanificar: armar }),
      guardar: async (a: Ajuste[]) => { ajustes = a; },
      emitir: (e: EventoAsistente) => eventos.push(e),
    },
  };
}

describe('conversación del asistente en el servidor', () => {
  it('corre las herramientas que pide Claude, guarda los ajustes y emite los eventos', async () => {
    const { cliente, pedidos } = clienteFalso([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'buscar_so', input: { texto: 'SO-502' } }] },
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u2', name: 'ajustar_so', input: { proyecto: 'SO-502-XYZ-1', prioridad: 1 } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Listo: SO-502-XYZ-1 queda primero.' }] },
    ]);
    const s = sesion();
    await conversar({ cliente, mensaje: 'Prioriza la SO-502', ...s.base });

    expect(s.ajustes()).toEqual([expect.objectContaining({ tipo: 'prioridad', proyecto_id: 'SO-502-XYZ-1', prioridad: 1 })]);
    expect(s.eventos.map(e => e.tipo)).toEqual(['herramienta', 'cambio', 'herramienta', 'texto', 'fin']);
    expect(s.eventos[2]).toEqual({ tipo: 'herramienta', nombre: 'ajustar_so', resumen: 'SO-502-XYZ-1: prioridad 1' });

    const primero = pedidos[0] as { model: string; system: string; tools: { name: string; eager_input_streaming: boolean }[]; fallbacks: string; betas: string[]; messages: { content: { text: string }[] }[]; thinking: unknown };
    expect(primero).toMatchObject({ model: 'claude-opus-5-5', system: INSTRUCCIONES, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], thinking: { type: 'adaptive' } });
    expect(primero.tools.every(t => t.eager_input_streaming)).toBe(true);
    expect(primero.messages[0].content[0].text).toMatch(/^<contexto>\nHoy: 2026-10-05/);
    expect(primero.messages[0].content[1].text).toBe('Prioriza la SO-502');
    // El segundo pedido trae la respuesta de Claude y el resultado de la herramienta, sin editar lo anterior.
    const segundo = pedidos[1] as { messages: { role: string; content: { type: string; tool_use_id?: string }[] }[] };
    expect(segundo.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(segundo.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'u1' });
  });

  it('devuelve los errores de una herramienta a Claude y sigue la misma conversación', async () => {
    const { cliente, pedidos } = clienteFalso([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'cambiar_estado', input: { op_ids: ['inventado'], estado: 'cerrada' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: '¿Qué operación?' }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Entendido.' }] },
    ]);
    const s = sesion();
    await conversar({ cliente, mensaje: 'Cierra el fresado', ...s.base });
    expect(s.eventos[0]).toMatchObject({ tipo: 'herramienta', error: true });
    const segundo = pedidos[1] as { messages: { content: { is_error?: boolean; content?: string }[] }[] };
    expect(segundo.messages[2].content[0]).toMatchObject({ is_error: true, content: expect.stringContaining('No encontré estas operaciones') });
    expect(s.ajustes()).toEqual([]);

    const fin = s.eventos.at(-1) as { tipo: 'fin'; conversacion: string };
    await conversar({ cliente, mensaje: 'La de SO-501', conversacion: fin.conversacion, ...s.base });
    const tercero = pedidos[2] as { messages: { role: string }[] };
    expect(tercero.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });
});

// La app como página publicada en claude.ai, sin servidor: arma el plan en el navegador con los datos publicados
// junto a la página, guarda los ajustes en la base compartida de la página (capacidad `db`: los ve todo el que la
// abre, en vivo) y el asistente usa la cuenta de Claude de quien la mira (capacidad `sample`).
import { ErrorHerramienta, HERRAMIENTAS, INSTRUCCIONES, contextoPlanta, ejecutarHerramienta, type Contexto } from '../../shared/asistente';
import { armarEstado, type DatosPlanta } from '../../shared/plan';
import type { Ajuste, EstadoPlanta } from '../../shared/tipos';
import type { Backend } from './backend';
import type { Layout } from './tipos-layout';

/** Lo que define index.html de la página publicada. */
export interface ConfigPagina { datos: string; layout: string }

type DatosPublicados = Omit<DatosPlanta, 'feriados' | 'ajustes'> & { feriados: string[] };

// ---- tipos mínimos del runtime de claude.ai (contrato 0.2.x: claude.use) ----
interface Snapshot { docs: { data(): Record<string, unknown> | undefined }[] }
interface Coleccion {
  doc(id: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
  onSnapshot(next: (s: Snapshot) => void, error?: (e: { code: string }) => void): () => void;
}
interface Db { collection(path: string): Coleccion }
interface HerramientaPagina { name: string; description: string; inputSchema: object; execute(input: Record<string, unknown>): unknown }
type Turnos = { role: 'user' | 'assistant'; content: string }[];
interface Sample {
  (input: Turnos, opciones: { tools: HerramientaPagina[]; signal: AbortSignal; modelTier: 'quick' | 'default' | 'complex'; onText: (u: { delta: string }) => void }): Promise<{ text: string }>;
  limits(): Promise<{ tools?: { maxCount: number } }>;
}
const usar = <T>(nombre: string): Promise<T | null> =>
  (window as unknown as { claude?: { use(n: string): Promise<T | null> } }).claude?.use(nombre).catch(() => null) ?? Promise.resolve(null);

const CLAVE_LOCAL = 'shoptrack.ajustes';
const leerLocal = (): Ajuste[] => { try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? '[]'); } catch { return []; } };
const guardarLocal = (a: Ajuste[]) => { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(a)); } catch { /* sin almacenamiento */ } };

/** Mensaje para el supervisor según el código de error de `sample`. */
function mensajeSample(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'cancelled': return 'Pedido detenido.';
    case 'not_granted': return 'No se dio permiso para que esta página use Claude. Recarga la página para que lo vuelva a pedir.';
    case 'sampling_disabled': case 'capability_disabled': case 'not_declared': return 'Claude no está disponible para esta cuenta o en esta vista.';
    case 'tools_unavailable': return 'Esta vista no permite que Claude use las herramientas del plan.';
    case 'rate_limited': return 'Se alcanzó el límite de uso de Claude. Intenta de nuevo en un rato.';
    case 'session_expired': return 'La sesión de claude.ai venció: vuelve a iniciar sesión.';
    case 'refused': return 'Claude no puede ayudar con ese pedido.';
    case 'prompt_too_large': return 'La conversación es muy larga: empieza una nueva.';
    default: return 'No se pudo completar el pedido. Intenta de nuevo.';
  }
}

export function backendPagina(cfg: ConfigPagina): Backend {
  const datos = fetch(cfg.datos).then(r => {
    if (!r.ok) throw new Error(`No se pudieron cargar los datos (${r.status})`);
    return r.json() as Promise<DatosPublicados>;
  });
  let ajustes: Ajuste[] = leerLocal();
  const oyentes = new Set<() => void>();
  const avisar = () => oyentes.forEach(f => f());
  const ordenar = (xs: Ajuste[]) => [...xs].sort((a, b) => a.creado.localeCompare(b.creado));

  // Base compartida: los ajustes de todos los que abren la página, en vivo. Sin ella, quedan en este navegador.
  const db = usar<Db>('db').then(d => {
    if (!d) return null;
    d.collection('ajustes').onSnapshot(s => {
      ajustes = ordenar(s.docs.map(x => x.data() as unknown as Ajuste).filter(a => a?.id));
      avisar();
    }, () => { /* sin base: siguen los ajustes de este navegador */ });
    return d;
  });

  // El plan arranca hoy (hora de Costa Rica), aunque los datos se hayan publicado otro día.
  const hoy = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
  const armar = (d: DatosPublicados, con: Ajuste[]): EstadoPlanta =>
    armarEstado({ ...d, hoy: hoy(), feriados: new Set(d.feriados), ajustes: con });

  async function guardar(nuevos: Ajuste[]) {
    const antes = ajustes;
    ajustes = nuevos;            // se ve al momento; la base confirma después
    avisar();
    const base = await db;
    if (!base) { guardarLocal(nuevos); return; }
    const col = base.collection('ajustes');
    try {
      for (const a of nuevos) if (!antes.some(x => x.id === a.id)) await col.doc(a.id).set({ ...a });
      for (const a of antes) if (!nuevos.some(x => x.id === a.id)) await col.doc(a.id).delete();
    } catch (e) {
      // Sin permiso de escritura (p. ej. acceso de solo lectura): se deshace lo que se mostró.
      ajustes = antes;
      avisar();
      const code = (e as { code?: string })?.code;
      throw new Error(code === 'invalid_argument' ? 'No tienes permiso para cambiar el plan compartido de esta página.' : 'No se pudo guardar el cambio. Intenta de nuevo.');
    }
  }

  return {
    refrescoMs: 0,
    layout: () => fetch(cfg.layout).then(r => r.json() as Promise<Layout>),
    estado: async () => armar(await datos, ajustes),
    quitarAjuste: async id => guardar(ajustes.filter(a => a.id !== id)),
    async asistente() {
      const sample = await usar<Sample>('sample');
      if (!sample) return 'El asistente usa tu cuenta de Claude y solo funciona al abrir la página dentro de claude.ai.';
      const l = await sample.limits().catch(() => null);
      return l?.tools ? true : 'Esta vista no permite que Claude use las herramientas del plan.';
    },
    async preguntar(p) {
      const sample = await usar<Sample>('sample');
      if (!sample) throw new Error('El asistente no está disponible en esta vista.');
      const d = await datos;
      const contexto = (): Contexto => ({ estado: armar(d, ajustes), ajustes, replanificar: con => armar(d, con) });
      const max = (await sample.limits().catch(() => null))?.tools?.maxCount ?? HERRAMIENTAS.length;
      const tools: HerramientaPagina[] = HERRAMIENTAS.slice(0, max).map(h => ({
        name: h.name, description: h.description, inputSchema: h.input_schema,
        async execute(input) {
          try {
            const r = ejecutarHerramienta(h.name, input, contexto());
            if (r.ajustes) { await guardar(r.ajustes); p.onEvento({ tipo: 'cambio' }); }
            p.onEvento({ tipo: 'herramienta', nombre: h.name, resumen: r.resumen });
            return r.resultado;
          } catch (e) {
            const mensaje = e instanceof ErrorHerramienta ? e.message : `Error al ejecutar ${h.name}: ${(e as Error).message}`;
            p.onEvento({ tipo: 'herramienta', nombre: h.name, resumen: mensaje, error: true });
            throw new Error(mensaje);   // Claude lo recibe como "Error: …" y sigue
          }
        },
      }));
      // Sin system prompt en la página: las instrucciones y el contexto van en un primer turno del usuario.
      const turnos: Turnos = [
        { role: 'user', content: `${INSTRUCCIONES}\n\n<contexto>\n${contextoPlanta(contexto().estado)}\n</contexto>` },
        ...p.historial.filter(t => t.texto.trim()).map(t => ({ role: t.rol === 'usuario' ? 'user' as const : 'assistant' as const, content: t.texto })),
        { role: 'user', content: p.mensaje },
      ];
      try {
        await sample(turnos, { tools, signal: p.signal, modelTier: 'quick', onText: ({ delta }) => p.onEvento({ tipo: 'texto', delta }) });
        p.onEvento({ tipo: 'fin', conversacion: 'pagina' });
      } catch (e) {
        throw new Error(mensajeSample(e));
      }
    },
    alCambiar(fn) { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
  };
}

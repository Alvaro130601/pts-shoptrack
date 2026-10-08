// La app como página publicada en claude.ai, sin servidor: arma el plan en el navegador, guarda los ajustes en la
// base compartida de la página (capacidad `db`: los ve todo el que la abre, en vivo) y el asistente usa la cuenta
// de Claude de quien la mira (capacidad `sample`). Con `zoho`, lee Zoho en vivo con el conector Zoho Projects de
// quien la abre (capacidad `mcp`); mientras tanto, o si no se puede, muestra los datos publicados con la página.
import { ErrorHerramienta, HERRAMIENTAS, INSTRUCCIONES, contextoPlanta, ejecutarHerramienta, type Contexto } from '../../shared/asistente';
import { armarEstado, type DatosPlanta } from '../../shared/plan';
import type { AccionFuente, Ajuste, EstadoPlanta } from '../../shared/tipos';
import { leerZohoCon, type LecturaZoho, type LlamarZoho, type MapeoZoho } from '../../shared/zoho';
import type { Backend } from './backend';
import type { Layout } from './tipos-layout';

/** Lo que define index.html de la página publicada. `zoho`: leer Zoho en vivo (los datos traen cómo). */
export interface ConfigPagina { datos: string; layout: string; zoho?: boolean }

type DatosPublicados = Omit<DatosPlanta, 'feriados' | 'ajustes'> & { feriados: string[]; zoho?: MapeoZoho };

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
interface ErrorMcp { code?: string; message?: string; retryable?: boolean; retryAfterMs?: number }
interface Mcp {
  callTool(server: string, tool: string, input?: unknown, opciones?: { cache?: { staleTime?: number } }): Promise<{ payload?: unknown }>;
}
interface Permisos { state(nombre: string): Promise<string>; manage(): Promise<void> }
const usar = <T>(nombre: string): Promise<T | null> =>
  (window as unknown as { claude?: { use(n: string): Promise<T | null> } }).claude?.use(nombre).catch(() => null) ?? Promise.resolve(null);

/** Nombre del conector en claude.ai: el mismo que declara el manifiesto de la página (capacidad mcp). */
const CONECTOR_ZOHO = 'Zoho Projects';
const PERMISO_ZOHO = `mcp:${CONECTOR_ZOHO}`;
/** Cada cuánto se vuelve a leer Zoho (la página relee el plan cada 5 min). */
const VIGENCIA_ZOHO = 4 * 60_000;

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

/** Por qué no se pudo leer Zoho, según el código de error de la capacidad `mcp`: cada uno se arregla distinto. */
export function mensajeZoho(e: unknown): string {
  const err = e as ErrorMcp;
  switch (err?.code) {
    case 'sin_mcp': case 'not_granted': case 'capability_disabled': case 'capability_removed':
      return 'esta vista no puede usar los conectores de claude.ai';
    case 'server_not_connected': case 'server_not_found':
      return 'agrega el conector Zoho Projects en claude.ai → Configuración → Conectores';
    case 'needs_reauth': return 'vuelve a conectar Zoho Projects en claude.ai → Configuración → Conectores';
    case 'selection_required': return 'hay más de una conexión de Zoho Projects: elige cuál usar en el aviso de claude.ai';
    case 'not_in_manifest': case 'consent_required': return 'no se dio permiso para que esta página lea Zoho (se cambia en Permisos de la página)';
    case 'blocked_by_policy': case 'approval_required': return 'la organización no permite que esta página use Zoho Projects';
    case 'server_unavailable': case 'rate_limited': return 'Zoho no respondió; se vuelve a intentar en unos minutos';
    case 'tool_error': return `Zoho respondió con un error${err.message ? `: ${err.message.slice(0, 200)}` : ''}`;
    default: return (e as Error)?.message || 'no se pudo leer Zoho';
  }
}

/** Lee la vista "Carga de trabajo" con el conector de quien abre la página. Reintenta una vez lo que es pasajero. */
async function leerZohoPagina(m: MapeoZoho): Promise<LecturaZoho> {
  const mcp = await usar<Mcp>('mcp');
  if (!mcp) throw { code: 'sin_mcp' } satisfies ErrorMcp;
  const llamar: LlamarZoho = async (herramienta, consulta) => {
    const input = { path_variables: { portal_id: m.portal.id }, query_params: consulta };
    const una = async () => {
      const { payload } = await mcp.callTool(CONECTOR_ZOHO, herramienta, input, { cache: { staleTime: 60_000 } });
      if (typeof payload !== 'object' || payload === null) throw new Error(`respuesta inesperada de Zoho en ${herramienta}`);
      return payload;
    };
    try { return await una(); } catch (e) {
      const err = e as ErrorMcp;
      if (!err?.retryable) throw e;
      await new Promise(r => setTimeout(r, Math.min(err.retryAfterMs ?? 0, 15_000) || 1500 + Math.random() * 1500));
      return una();
    }
  };
  return leerZohoCon(llamar, m);
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
const textoError = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 500);
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

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
    try {
      d.collection('ajustes').onSnapshot(s => {
        ajustes = ordenar(s.docs.map(x => x.data() as unknown as Ajuste).filter(a => a?.id));
        avisar();
      }, () => { /* sin base: siguen los ajustes de este navegador */ });
    } catch { /* idem */ }
    return d;
  }).catch(() => null);

  /** Diagnóstico en la base de la página (colección `diagnostico`): el último resultado de leer Zoho y el último
   *  error del navegador, para revisar a distancia qué pasó. Si no se puede guardar, no pasa nada. */
  const diagnostico = (clave: string, datos: Record<string, unknown>) => {
    db.then(base => base?.collection('diagnostico').doc(clave)
      .set({ ...datos, cuando: new Date().toISOString(), navegador: navigator.userAgent.slice(0, 160) }))
      .catch(() => { /* sin base o sin permiso */ });
  };
  window.addEventListener('error', e => diagnostico('error', { mensaje: textoError(e.error ?? e.message), donde: `${String(e.filename ?? '').split('/').pop()}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', e => diagnostico('error', { mensaje: textoError(e.reason), donde: 'promesa' }));
  window.addEventListener('shoptrack-error', e => diagnostico('error', { mensaje: textoError((e as CustomEvent).detail), donde: 'dibujo' }));
  window.addEventListener('shoptrack-rendimiento', e => diagnostico('rendimiento', { ...(e as CustomEvent).detail }));

  // Zoho en vivo: se lee en segundo plano y, al terminar, la app vuelve a pedir el estado (avisar). La primera vez
  // claude.ai pide permiso para usar el conector: si todavía no lo hay, no se lee al abrir (el diálogo taparía la
  // planta de sorpresa) sino cuando el supervisor toca "Leer Zoho en vivo" en la barra.
  const zoho = {
    lectura: null as (LecturaZoho & { leido: string }) | null,
    error: null as string | null, codigo: null as string | null,
    espera: null as AccionFuente | null,
    leyendo: false, t: 0,
  };
  function refrescarZoho(m: MapeoZoho, aPedido = false) {
    if (zoho.leyendo || (!aPedido && zoho.t && Date.now() - zoho.t < VIGENCIA_ZOHO)) return;
    zoho.leyendo = true;
    const inicio = Date.now();
    (async () => {
      if (!aPedido) {
        const permisos = await usar<Permisos>('permissions');
        const p = permisos ? await permisos.state(PERMISO_ZOHO).catch(() => 'unavailable') : 'granted';
        if (p === 'prompt' || p === 'denied') { zoho.espera = p === 'prompt' ? 'conectar_zoho' : 'permisos_zoho'; return; }
      }
      zoho.espera = null;
      const l = await leerZohoPagina(m);
      zoho.lectura = { ...l, leido: new Date().toISOString() };
      zoho.error = zoho.codigo = null;
      const tareas = l.proyectos.reduce((s, p) => s + p.listas.reduce((k, x) => k + x.tareas.length, 0), 0);
      diagnostico('zoho', { ok: true, proyectos: l.proyectos.length, tareas, ms: Date.now() - inicio });
    })()
      .catch(e => {
        zoho.error = mensajeZoho(e);
        zoho.codigo = (e as ErrorMcp)?.code ?? null;
        diagnostico('zoho', { ok: false, codigo: zoho.codigo, mensaje: zoho.error, detalle: textoError(e), ms: Date.now() - inicio });
      })
      .finally(() => { zoho.t = Date.now(); zoho.leyendo = false; avisar(); });
  }

  /** Botón de la barra: leer Zoho ahora (la primera vez claude.ai pide permiso) o abrir los permisos de la página. */
  async function accion(a: AccionFuente) {
    const d = await datos;
    if (!d.zoho) return;
    if (a === 'permisos_zoho') await (await usar<Permisos>('permissions'))?.manage().catch(() => { /* sin panel */ });
    zoho.espera = null;
    refrescarZoho(d.zoho, true);
    avisar();   // la barra pasa a "leyendo Zoho…"
  }

  /** Los datos con que se arma el plan ahora: los de Zoho si ya llegaron, si no los publicados con la página. */
  function actuales(d: DatosPublicados): DatosPublicados & Pick<DatosPlanta, 'nota_fuente' | 'accion_fuente'> {
    if (!d.zoho) return d;
    refrescarZoho(d.zoho);
    const l = zoho.lectura;
    if (l) {
      const fallo = zoho.error && `El último intento de leer Zoho falló (${zoho.error}): se muestran los datos de las ${hora(l.leido)}`;
      return { ...d, proyectos: l.proyectos, fuente: 'zoho', datos_de: l.leido, avisos: [...(fallo ? [fallo] : []), ...l.avisos],
        ...(fallo ? { nota_fuente: 'sin conexión' } : {}) };
    }
    const respaldo = !d.datos_de ? 'los datos publicados con la página'
      : d.fuente === 'zoho' ? `la copia de Zoho del ${fechaCorta(d.datos_de)}` : `la exportación del ${fechaCorta(d.datos_de)}`;
    const avisos = (a: string) => [a, ...(d.avisos ?? [])];
    if (zoho.espera === 'conectar_zoho') {
      return { ...d, accion_fuente: 'conectar_zoho',
        avisos: avisos(`Se muestra ${respaldo}. Para ver Zoho en vivo toca "Leer Zoho en vivo" arriba a la derecha: la primera vez claude.ai te pide permiso para usar tu conector.`) };
    }
    if (zoho.espera === 'permisos_zoho') {
      return { ...d, accion_fuente: 'permisos_zoho',
        avisos: avisos(`Zoho está bloqueado para esta página: se muestra ${respaldo}. Toca "Permitir Zoho" arriba a la derecha o actívalo en Permisos de la página.`) };
    }
    if (zoho.error) {
      return { ...d, nota_fuente: 'sin Zoho', avisos: avisos(`No se pudo leer Zoho en vivo: ${zoho.error}${zoho.codigo ? ` [${zoho.codigo}]` : ''}. Se muestra ${respaldo}.`) };
    }
    return { ...d, nota_fuente: 'leyendo Zoho…' };
  }

  // El plan arranca hoy (hora de Costa Rica), aunque los datos se hayan publicado otro día.
  const hoy = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
  const armar = (d: DatosPublicados, con: Ajuste[]): EstadoPlanta =>
    armarEstado({ ...d, hoy: hoy(), feriados: new Set(d.feriados), ajustes: con });
  /** El plan con los datos actuales. Si con los de Zoho algo falla, se arma con los publicados y se avisa. */
  function plan(d: DatosPublicados, con: Ajuste[]): EstadoPlanta {
    const a = actuales(d);
    try { return armar(a, con); } catch (e) {
      if (a === d) throw e;
      diagnostico('error', { mensaje: textoError(e), donde: 'plan con los datos de Zoho' });
      return armar({ ...d, nota_fuente: 'sin Zoho',
        avisos: [`No se pudo armar el plan con los datos de Zoho (${textoError(e)}): se muestran los datos publicados.`, ...(d.avisos ?? [])] }, con);
    }
  }

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
    refrescoMs: cfg.zoho ? 5 * 60_000 : 0,
    layout: () => fetch(cfg.layout).then(r => r.json() as Promise<Layout>),
    estado: async () => plan(await datos, ajustes),
    accion: a => { void accion(a); },
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
      const d = await datos;   // los mismos datos que se ven en la planta
      const contexto = (): Contexto => ({ estado: plan(d, ajustes), ajustes, replanificar: con => plan(d, con) });
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

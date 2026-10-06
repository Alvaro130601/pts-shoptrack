// Datos SIMULADOS con la misma estructura que Zoho (ver docs/PROCESO.md): proyectos SO-… con listas
// "Ítem N (Q unidades)" y tareas "H. <proceso>" en orden de ruta, más una tarea Material al inicio de cada ítem.
// Clientes y SO son ficticios. Fechas relativas a "hoy" para que haya casos verdes, amarillos y rojos.
import type { ListaCruda, ProyectoCrudo, TareaCruda } from '../../shared/tipos.ts';
import { sumarHabiles } from '../../shared/reglas.ts';

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const CLIENTES = [
  ['Cliente Med-A', 'CMA'], ['Cliente Med-B', 'CMB'], ['Cliente Ortho-C', 'COC'],
  ['Cliente Cardio-D', 'CCD'], ['Cliente Endo-E', 'CEE'], ['Cliente Ind-F', 'CIF'],
] as const;

type Paso = readonly [nombre: string, equipo: string, horas: readonly [number, number], escala: boolean];
const PROG = (equipo: string): Paso => ['H. Programación', equipo, [0.5, 2], false];
const SETUP = (equipo: string): Paso => ['H. Set Up', equipo, [0.5, 2], false];
const ANODIZADO: Paso = ['H. Anodizado', 'No Requiere', [0, 0], false];

/** Rutas típicas (peso relativo, pasos en orden). `escala` = las horas crecen con la cantidad. */
const RUTAS: { peso: number; pasos: Paso[] }[] = [
  { peso: 28, pasos: [PROG('Fresado CNC'), SETUP('Fresado CNC'), ['H. Fresado CNC', 'Fresado CNC', [2, 9], true]] },
  { peso: 9, pasos: [PROG('Fresado CNC'), SETUP('Fresado CNC'), ['H. Fresado CNC', 'Fresado CNC', [2, 8], true], ['H. Erosionado', 'Erosionado', [2, 8], true]] },
  { peso: 7, pasos: [PROG('Torno CNC'), SETUP('Torno CNC'), ['H. Torno CNC', 'Torno CNC', [1.5, 7], true], ['H. Erosionado', 'Erosionado', [1.5, 6], true], ANODIZADO] },
  { peso: 15, pasos: [['H. Fresado', 'Fresado', [1.5, 6], true]] },
  { peso: 8, pasos: [['H. Torno', 'Torno', [1, 5], true]] },
  { peso: 10, pasos: [PROG('Torno CNC'), SETUP('Torno CNC'), ['H. Torno CNC', 'Torno CNC', [1.5, 8], true]] },
  { peso: 6, pasos: [PROG('Fresado CNC'), SETUP('Fresado CNC'), ['H. Fresado CNC', 'Fresado CNC', [2, 8], true], ANODIZADO] },
  { peso: 4, pasos: [PROG('Corte láser'), ['H. Corte láser', 'Corte láser', [0.5, 3], true]] },
  { peso: 5, pasos: [['H. Fresado', 'Fresado', [1, 3], true], PROG('Fresado CNC'), SETUP('Fresado CNC'), ['H. Fresado CNC', 'Fresado CNC', [2, 7], true]] },
  { peso: 4, pasos: [PROG('Erosionado'), ['H. Erosionado', 'Erosionado', [3, 10], true]] },
  { peso: 6, pasos: [['H. Fresado', 'Fresado', [1.5, 4], true], ['H. Tratamiento térmico', 'Tratamiento térmico', [5, 5], false],
    ['H. Revenido', 'Tratamiento térmico', [2, 2], false], ['H. Rectificado', 'Rectificado', [1, 5], true], ['H. Erosionado', 'Erosionado', [2, 6], true]] },
];
const PESO_TOTAL = RUTAS.reduce((s, r) => s + r.peso, 0);
/** Cuántas tareas pueden estar "En proceso" a la vez por equipo (≈ máquinas o programadores disponibles). */
const CUPOS: Record<string, number> = {
  'Fresado CNC': 5, Fresado: 4, 'Torno CNC': 1, Torno: 2, Erosionado: 2, Rectificado: 2, 'Tratamiento térmico': 1,
  'Corte láser': 1, Programación: 1, 'No Requiere': 3,
};

export function generarSeed(hoy: string, feriados: Set<string>): ProyectoCrudo[] {
  const r = rng(388);
  const entre = (a: number, b: number) => a + r() * (b - a);
  const entero = (a: number, b: number) => Math.floor(entre(a, b + 1));
  const media = (x: number) => Math.round(x * 2) / 2;
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const proyectos: ProyectoCrudo[] = [];
  const enProceso: Record<string, number> = {};
  const tomarCupo = (equipo: string) => {
    if ((enProceso[equipo] ?? 0) >= (CUPOS[equipo] ?? 1)) return false;
    enProceso[equipo] = (enProceso[equipo] ?? 0) + 1;
    return true;
  };

  const nuevoProyecto = (num: number, cliente: readonly [string, string], entrega: string) => {
    const prefijo = String.fromCharCode(65 + entero(0, 25)) + entero(10, 99) + String.fromCharCode(65 + entero(0, 25));
    let n = entero(10, 40);
    const p: ProyectoCrudo = {
      id: `seed-${num}`, nombre: `SO-${num}-${cliente[1]}-${entero(1, 3)}`, estado: 'Activo',
      cliente: cliente[0], fecha_entrega: entrega, listas: [],
    };
    const tarea = (nombre: string, equipo: string | null, estado: string, est: number, reg: number): TareaCruda => ({
      id: `${p.id}-t${n}`, clave: `${prefijo}-T${n++}`, nombre, equipo, estado, horas_estimadas: est, horas_registradas: reg,
    });
    return { p, tarea };
  };

  // Rutas con avance simulado: pasos cerrados, el actual en proceso o pendiente, el resto pendiente.
  const itemSimulado = (p: ProyectoCrudo, tarea: ReturnType<typeof nuevoProyecto>['tarea'], linea: string): ListaCruda => {
    const qty = entero(1, 10);
    let x = r() * PESO_TOTAL;
    const ruta = RUTAS.find(rt => (x -= rt.peso) < 0) ?? RUTAS[0];
    const faltaMaterial = r() < 0.2;
    const n = ruta.pasos.length;
    // Paso donde va la pieza; con 8 % de probabilidad el ítem ya terminó.
    const actual = faltaMaterial ? -1 : r() < 0.08 ? n : entero(0, n - 1);
    const tareas: TareaCruda[] = [tarea('Material', null, faltaMaterial ? 'Pendiente' : 'Cerrada', 0, 0)];
    const estados = ruta.pasos.map(([nombre, equipo], i) => {
      const esProg = nombre === 'H. Programación';
      // Con material pendiente, la programación igual puede avanzar.
      if (faltaMaterial) return esProg && i === 0 ? pick(['Pendiente', 'Cerrada', 'Cerrada']) : 'Pendiente';
      if (i < actual) return 'Cerrada';
      if (i === actual) return r() < 0.6 && tomarCupo(esProg ? 'Programación' : equipo) ? 'En proceso' : 'Pendiente';
      return 'Pendiente';
    });
    // Set Up cerrado + mecanizado pendiente = la máquina ya está preparada (cuenta como en proceso).
    // Si no hay máquina libre para eso, el Set Up tampoco empezó.
    ruta.pasos.forEach(([nombre, equipo], i) => {
      if (nombre === 'H. Set Up' && estados[i] === 'Cerrada' && estados[i + 1] === 'Pendiente' && !tomarCupo(equipo)) estados[i] = 'Pendiente';
    });
    ruta.pasos.forEach(([nombre, equipo, [a, b], escala], i) => {
      const est = media(entre(a, b) * (escala ? 1 + (qty - 1) * 0.12 : 1));
      const estado = estados[i];
      const reg = estado === 'Cerrada' ? media(est * entre(0.85, 1.2)) : estado === 'En proceso' ? media(est * entre(0.15, 0.8)) : 0;
      const nom = nombre === 'H. Programación' && r() < 0.12 ? 'H. Progrmación' : nombre;
      tareas.push(tarea(nom, equipo, estado, est, reg));
    });
    return { id: `${p.id}-l${linea}`, nombre: `Ítem ${linea} (${qty} ${qty === 1 ? 'unidad' : 'unidades'})`, tareas };
  };

  let num = 10650;
  for (let s = 0; s < 26; s++) {
    const cliente = pick(CLIENTES);
    // La mayoría con margen; un par vencidas o muy justas.
    const entrega = sumarHabiles(hoy, s % 11 === 5 ? entero(-1, 2) : entero(4, 26), feriados);
    const { p, tarea } = nuevoProyecto(num++, cliente, entrega);
    const nItems = pick([1, 1, 1, 1, 2, 2, 3, 3, 4, 6]);
    let linea = entero(1, 20);
    for (let i = 0; i < nItems; i++) p.listas.push(itemSimulado(p, tarea, r() < 0.08 ? `${linea++}-A` : String(linea++)));

    // Casos especiales para que el demo muestre todo lo que la app entiende.
    if (s === 3) {
      // SO con ensamble y lista final de cierre.
      p.listas.push({ id: `${p.id}-cierre`, nombre: 'Cierre', tareas: [
        tarea('Ensamble', null, 'Pendiente', 4, 0), tarea('Calidad', null, 'Pendiente', 2, 0), tarea('Envío', null, 'Pendiente', 0, 0),
      ] });
    }
    if (s === 7) {
      // Un proceso que no está en config/centros.json: aparece en "Sin centro".
      p.listas[0].tareas.push(tarea('H. Lapeado', 'Lapeado', 'Pendiente', 3, 0));
    }
    proyectos.push(p);
  }

  // SO con los estados viejos de Zoho (como SO-10664-MCV-1): sin tarea Material, el bloqueo va en el estado.
  const viejo = nuevoProyecto(num++, CLIENTES[1], sumarHabiles(hoy, 12, feriados));
  const t = viejo.tarea;
  viejo.p.listas.push(
    { id: `${viejo.p.id}-l2A`, nombre: 'Ítem 2-A (4 unidades)', tareas: [t('H. Fresado', 'Fresado', 'Material Pendiente', 3, 0)] },
    ...[20, 21, 22].map(l => ({ id: `${viejo.p.id}-l${l}`, nombre: `Ítem ${l} (3 unidades)`, tareas: [
      t(l === 21 ? 'H. Progrmación' : 'H. Programación', 'Fresado CNC', 'Material Pendiente', 1.5, 0),
      t('H. Set Up', 'Fresado CNC', 'Material Pendiente', 1, 0),
      t('H. Fresado CNC', 'Fresado CNC', 'Material Pendiente', 4.5, 0),
    ] })),
    { id: `${viejo.p.id}-l23`, nombre: 'Ítem 23 (3 unidades)', tareas: [
      t('H. Torno CNC', 'Torno CNC', 'Pendiente Op.', 3, 0),
      t('H. Erosionado', 'Erosionado', 'Pendiente Op.', 2.5, 0),
      t('H. Anodizado', 'No Requiere', 'Pendiente Op.', 0, 0),
    ] },
  );
  proyectos.push(viejo.p);
  return proyectos;
}

import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import centrosJson from '../config/centros.json';
import { normalizarProyectos } from '../shared/ruta.ts';
import type { CentroConfig, ListaCruda, ProyectoCrudo, ReglasLectura, TareaCruda } from '../shared/tipos.ts';

const reglas = mapeo.lectura as ReglasLectura;
const centros = centrosJson.centros as CentroConfig[];

let n = 0;
const t = (nombre: string, equipo: string | null, estado = 'Pendiente', horas = 4, registradas = 0): TareaCruda =>
  ({ id: `t${++n}`, nombre, equipo, estado, horas_estimadas: horas, horas_registradas: registradas });
const lista = (nombre: string, tareas: TareaCruda[]): ListaCruda => ({ id: `l${++n}`, nombre, tareas });
const proyecto = (listas: ListaCruda[], extra: Partial<ProyectoCrudo> = {}): ProyectoCrudo =>
  ({ id: `p${++n}`, nombre: 'SO-10664-MCV-1', estado: 'Activo', cliente: 'Cliente', fecha_entrega: '2026-10-30', listas, ...extra });
const leer = (...listas: ListaCruda[]) => normalizarProyectos([proyecto(listas)], reglas, centros);

describe('estructura SO → ítems → ruta', () => {
  it('lee la línea y la cantidad del nombre de la lista', () => {
    const { sos } = leer(
      lista('Ítem 23 (3 unidades)', [t('H. Torno CNC', 'Torno CNC')]),
      lista('Ítem 2-A (4 unidades)', [t('H. Fresado', 'Fresado')]),
      lista('Item 5 (1 unidad)', [t('H. Fresado', 'Fresado')]),
      lista('Repuestos varios', [t('H. Fresado', 'Fresado')]),
    );
    expect(sos[0].so).toBe('SO-10664');
    expect(sos[0].items.map(i => [i.nombre, i.cantidad])).toEqual([
      ['Ítem 23', 3], ['Ítem 2-A', 4], ['Ítem 5', 1], ['Repuestos varios', null],
    ]);
  });

  it('une Set Up con el mecanizado siguiente y suma sus horas', () => {
    const { sos } = leer(lista('Ítem 22 (3 unidades)', [
      t('H. Programación', 'Fresado CNC', 'Cerrada', 2, 2),
      t('H. Set Up', 'Fresado CNC', 'Cerrada', 1, 1),
      t('H. Fresado CNC', 'Fresado CNC', 'Pendiente', 6),
    ]));
    const ruta = sos[0].items[0].ruta;
    expect(ruta.map(o => [o.nombre, o.tipo, o.centro_id])).toEqual([
      ['H. Programación', 'programacion', 'programacion'],
      ['H. Set Up + H. Fresado CNC', 'maquina', 'fresado-cnc'],
    ]);
    expect(ruta[1].horas_totales).toBe(7);
    expect(ruta[1].horas_pendientes).toBe(6);
    // Set Up cerrado y mecanizado sin empezar: la máquina ya está preparada.
    expect(ruta[1].estado).toBe('en_proceso');
  });

  it('reconoce el proceso por el equipo y la programación aunque el nombre tenga errores', () => {
    const { sos } = leer(lista('Ítem 23 (3 unidades)', [
      t('H. Progrmación', 'Torno CNC'),
      t('H. Torno CNC', 'Torno CNC'),
      t('H. Anodizado', 'No Requiere', 'Pendiente', 0),
      t('H. Lapeado', 'Lapeado'),
    ]));
    expect(sos[0].items[0].ruta.map(o => [o.tipo, o.centro_id, o.proceso])).toEqual([
      ['programacion', 'programacion', 'Programación'],
      ['maquina', 'torno-cnc', 'Torno CNC'],
      ['externo', 'externo', 'Servicio externo'],
      ['maquina', null, 'Lapeado'],
    ]);
    expect(sos[0].requiere_servicio_externo).toBe(true);
  });
});

describe('estados', () => {
  it('traduce los estados viejos: "Material Pendiente" agrega el paso Material y "Pendiente Op…" es pendiente', () => {
    const r = leer(
      lista('Ítem 21 (3 unidades)', [t('H. Fresado CNC', 'Fresado CNC', 'Material Pendiente')]),
      lista('Ítem 23 (3 unidades)', [t('H. Torno CNC', 'Torno CNC', 'Pendiente Op.'), t('H. Torno', 'Torno', 'Revisión')]),
    );
    const [i21, i23] = r.sos[0].items;
    expect(i21.ruta.map(o => [o.tipo, o.estado])).toEqual([['material', 'pendiente'], ['maquina', 'bloqueada']]);
    expect(i21.situacion).toBe('Esperando material');
    expect(i23.ruta[0].estado).toBe('en_cola');
    expect(r.estados_desconocidos).toEqual(['Revisión']);
  });

  it('la programación avanza mientras llega el material; la máquina espera ambos', () => {
    const { sos } = leer(lista('Ítem 1 (2 unidades)', [
      t('Material', null),
      t('H. Programación', 'Fresado CNC'),
      t('H. Set Up', 'Fresado CNC'),
      t('H. Fresado CNC', 'Fresado CNC'),
    ]));
    const [mat, prog, maq] = sos[0].items[0].ruta;
    expect(mat.estado).toBe('pendiente');
    expect(prog.estado).toBe('en_cola');
    expect(maq).toMatchObject({ estado: 'bloqueada', espera: 'Material' });
    expect(sos[0].items[0].etapa).toBe('Programación');
  });

  it('sin programa la máquina queda bloqueada; los planos bloquean también la programación', () => {
    const conPrograma = leer(lista('Ítem 1 (1 unidad)', [
      t('Material', null, 'Cerrada'), t('H. Programación', 'Fresado CNC', 'En proceso'), t('H. Fresado CNC', 'Fresado CNC'),
    ])).sos[0].items[0];
    expect(conPrograma.ruta[2]).toMatchObject({ estado: 'bloqueada', espera: 'Programación' });
    expect(conPrograma.situacion).toBe('En programación');

    const conPlanos = leer(lista('Ítem 1 (1 unidad)', [
      t('Planos', null), t('H. Programación', 'Fresado CNC'), t('H. Fresado CNC', 'Fresado CNC'),
    ])).sos[0].items[0];
    expect(conPlanos.ruta[1]).toMatchObject({ estado: 'bloqueada', espera: 'Planos' });
    expect(conPlanos.etapa).toBe('Planos');
  });

  it('una operación posterior queda en camino mientras la pieza está en un paso anterior', () => {
    const it = leer(lista('Ítem 23 (3 unidades)', [
      t('Material', null, 'Cerrada'),
      t('H. Torno CNC', 'Torno CNC', 'En proceso', 6, 2),
      t('H. Erosionado', 'Erosionado'),
      t('H. Anodizado', 'No Requiere'),
    ])).sos[0].items[0];
    expect(it.ruta.map(o => [o.estado, o.espera])).toEqual([
      ['hecha', undefined], ['en_proceso', undefined], ['en_camino', 'Torno CNC'], ['en_camino', 'Erosionado'],
    ]);
    expect(it.ruta[1].horas_pendientes).toBe(4);
    expect(it).toMatchObject({ estado: 'en_proceso', etapa: 'Producción', situacion: 'En Torno CNC' });
  });

  it('el SO va en la etapa de su ítem más atrasado; el cierre espera a todos los ítems', () => {
    const p = proyecto([
      lista('Ítem 1 (1 unidad)', [t('Material', null, 'Cerrada'), t('H. Fresado', 'Fresado', 'Cerrada')]),
      lista('Ítem 2 (1 unidad)', [t('Material', null), t('H. Fresado', 'Fresado')]),
      lista('Cierre', [t('Ensamble', null), t('Calidad', null), t('Envío', null)]),
    ]);
    const so = normalizarProyectos([p], reglas, centros).sos[0];
    expect(so.items.map(i => i.etapa)).toEqual(['Terminado', 'Material']);
    expect(so.etapa).toBe('Material');
    expect(so.requiere_ensamble).toBe(true);
    expect(so.cierre.map(o => [o.tipo, o.estado, o.espera])).toEqual([
      ['cierre', 'en_camino', 'Ítems sin terminar'], ['cierre', 'en_camino', 'Ítems sin terminar'], ['cierre', 'en_camino', 'Ítems sin terminar'],
    ]);
  });
});

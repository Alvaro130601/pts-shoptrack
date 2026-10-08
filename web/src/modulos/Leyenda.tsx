import { C } from '../colores';
import { GRUPOS, colorGrupo } from '../escena/modelos';
import type { EstadoCentro, EstadoMaquina } from '../../../shared/tipos';
import { Cajon } from './Cajon';

export function Leyenda({ maquinas, centros, onCerrar }: { maquinas: EstadoMaquina[]; centros: EstadoCentro[]; onCerrar: () => void }) {
  const nombres = new Map(maquinas.map(m => [m.id, m.nombre]));
  // Grupos de color presentes: cuántas máquinas y si hay convencionales (tono suave). '' = sin proceso asignado.
  const grupos = new Map<string, { n: number; convencional: boolean; sinProceso: string[] }>();
  for (const m of maquinas) {
    const g = m.grupo ?? '';
    const x = grupos.get(g) ?? { n: 0, convencional: false, sinProceso: [] };
    x.n++;
    x.convencional ||= !!m.convencional;
    if (!g) x.sinProceso.push(m.nombre);
    grupos.set(g, x);
  }
  const orden = [...Object.keys(GRUPOS), ''];
  return (
    <Cajon titulo="Leyenda" sub="Cómo leer la planta" onCerrar={onCerrar}>
      <section className="leyenda-sec">
        <h4>Cómo se arma el plan</h4>
        <p className="nota">
          Cada SO tiene ítems y cada ítem una ruta: sus tareas de Zoho en orden. ShopTrack reparte el trabajo de cada
          proceso entre sus máquinas según la carga, respetando la ruta: una operación no empieza antes de que termine
          la anterior del mismo ítem. La máquina es una <b>sugerencia</b>; el supervisor decide.
        </p>
        <dl className="leyenda-dl">
          <dt>▶ En proceso</dt><dd>La tarea está En proceso en Zoho (o su Set Up ya se cerró).</dd>
          <dt>● En cola</dt><dd>Puede empezar ya: lo anterior de la ruta está hecho y hay material y programa.</dd>
          <dt>○ En camino</dt><dd>La pieza todavía está en un paso anterior de su ruta.</dd>
          <dt>! Bloqueada</dt><dd>Falta material, planos o programa.</dd>
        </dl>
      </section>
      <section className="leyenda-sec">
        <h4>Semáforo</h4>
        <dl className="leyenda-dl">
          <dt><span className="punto" style={{ background: C.verde }} /> A tiempo</dt>
          <dd>Con el plan actual termina con más de 1 día hábil de holgura antes de su límite.</dd>
          <dt><span className="punto" style={{ background: C.amarillo }} /> En riesgo</dt>
          <dd>Holgura de 1 día hábil o menos.</dd>
          <dt><span className="punto" style={{ background: C.rojo }} /> Atrasada</dt>
          <dd>El límite ya pasó, o con el plan actual termina después del límite.</dd>
          <dt><span className="punto" style={{ background: C.libre }} /> Gris</dt>
          <dd>Máquina libre, o trabajo de un SO sin fecha de entrega (sin fecha no hay semáforo).</dd>
        </dl>
        <p className="nota">
          El límite de cada paso se calcula hacia atrás desde la entrega: calidad y envío (2 días hábiles, 3 con ensamble y
          servicio externo) y lo que falta de la ruta. Con el servicio externo al final da los buffers de siempre: 2, 5 y 6 días.
          Material: el plan supone que llega en 3 días hábiles.
        </p>
      </section>
      <section className="leyenda-sec">
        <h4>En cada máquina</h4>
        <dl className="leyenda-dl">
          <dt><span className="andon-mini"><i style={{ background: C.acento }} /><i style={{ background: C.rojo }} /><i style={{ background: C.amarillo }} /><i style={{ background: C.verde }} /></span> Torre de luces</dt>
          <dd>Azul parpadeando: está mecanizando. Abajo se enciende el peor semáforo de su cola.</dd>
          <dt><span className="bloque-mini" style={{ background: C.acento }} /> Caja azul</dt>
          <dd>Operación en proceso (la de abajo de la pila).</dd>
          <dt><span className="bloque-mini" style={{ background: C.amarillo }} /> Caja de color</dt>
          <dd>Operación en cola sugerida para esa máquina, con el color de su semáforo. Más arriba = más tarde.</dd>
          <dt><span className="bloque-mini fantasma" /> Caja translúcida</dt>
          <dd>Próxima: en camino o bloqueada, ya repartida a esa máquina.</dd>
          <dt><span className="piso-mini" /> Piso teñido</dt>
          <dd>Color del peor semáforo de la máquina.</dd>
          <dt><kbd>▶ +3</kbd> Etiqueta</dt>
          <dd>▶ mecanizando, ‖ detenida con trabajo en cola; +3 = operaciones en cola. Al alejar la cámara solo queda el número.</dd>
        </dl>
      </section>
      <section className="leyenda-sec">
        <h4>Procesos y máquinas</h4>
        <dl className="leyenda-dl procesos">
          {centros.map(c => (
            <div key={c.id} className="par">
              <dt>{c.nombre}</dt>
              <dd>{c.tipo === 'maquina' ? c.recursos.map(id => nombres.get(id) ?? id).join(', ') || 'Sin máquinas'
                : c.tipo === 'programacion' ? `${c.recursos.length} programador(es), ${c.capacidad_horas_dia} h/día`
                  : c.tipo === 'puesto' ? `${c.recursos.length} puesto(s) fuera del plano, ${c.capacidad_horas_dia} h/día`
                    : 'Proveedores, fuera de planta'}</dd>
            </div>
          ))}
        </dl>
        <p className="nota">Se configuran en config/centros.json según el Equipo asignado de cada tarea en Zoho.</p>
      </section>
      <section className="leyenda-sec">
        <h4>Color de las máquinas</h4>
        <ul className="familias">
          {orden.filter(g => grupos.has(g)).map(g => (
            <li key={g || 'sin'} title={g ? undefined : grupos.get(g)!.sinProceso.join(', ')}>
              <i className="muestra" style={{ background: colorGrupo(g) }} />
              {grupos.get(g)!.convencional && <i className="muestra" style={{ background: colorGrupo(g, true) }} />}
              {g ? GRUPOS[g].nombre : 'Sin proceso asignado'} <small>{grupos.get(g)!.n}</small>
            </li>
          ))}
        </ul>
        <p className="nota">Cada máquina lleva el color de su grupo de proceso (el tono más suave es la versión convencional).
          Los colores fuertes son de estado. La forma es aproximada, a escala del CAD. Se configuran en config/centros.json →
          grupo y config/maquinas.json → familia.</p>
      </section>
      <section className="leyenda-sec">
        <h4>Controles</h4>
        <dl className="leyenda-dl atajos">
          <dt><kbd>Arrastrar</kbd></dt><dd>Mover la planta</dd>
          <dt><kbd>Rueda</kbd></dt><dd>Acercar o alejar</dd>
          <dt><kbd>Clic derecho</kbd> + arrastrar</dt><dd>Girar la vista</dd>
          <dt><kbd>Clic</kbd> en máquina</dt><dd>Ver su plan</dd>
          <dt><kbd>/</kbd></dt><dd>Buscar</dd>
          <dt><kbd>Esc</kbd></dt><dd>Cerrar panel o módulo</dd>
        </dl>
      </section>
    </Cajon>
  );
}

import { C } from '../colores';
import { NOMBRE_FAMILIA } from '../familias';
import type { EstadoMaquina, FamiliaMaquina } from '../../../shared/tipos';
import { Cajon } from './Cajon';

export function Leyenda({ maquinas, onCerrar }: { maquinas: EstadoMaquina[]; onCerrar: () => void }) {
  const cuenta = new Map<FamiliaMaquina, number>();
  for (const m of maquinas) cuenta.set(m.familia ?? 'generica', (cuenta.get(m.familia ?? 'generica') ?? 0) + 1);
  return (
    <Cajon titulo="Leyenda" sub="Cómo leer la planta" onCerrar={onCerrar}>
      <section className="leyenda-sec">
        <h4>Semáforo</h4>
        <dl className="leyenda-dl">
          <dt><span className="punto" style={{ background: C.verde }} /> A tiempo</dt>
          <dd>Con la cola actual termina con más de 1 día hábil de holgura antes del límite de producción.</dd>
          <dt><span className="punto" style={{ background: C.amarillo }} /> En riesgo</dt>
          <dd>Holgura de 1 día hábil o menos (por liberar: 2 días o menos).</dd>
          <dt><span className="punto" style={{ background: C.rojo }} /> Atrasada</dt>
          <dd>El límite ya pasó, o con la cola actual termina después del límite.</dd>
          <dt><span className="punto" style={{ background: C.libre }} /> Libre</dt>
          <dd>Sin operaciones en proceso ni en cola.</dd>
        </dl>
        <p className="nota">Límite de producción = entrega − buffer (2 días hábiles; 5 con servicio externo; 6 con servicio externo + ensamble).</p>
      </section>
      <section className="leyenda-sec">
        <h4>En cada máquina</h4>
        <dl className="leyenda-dl">
          <dt><span className="andon-mini"><i style={{ background: C.acento }} /><i style={{ background: C.rojo }} /><i style={{ background: C.amarillo }} /><i style={{ background: C.verde }} /></span> Torre de luces</dt>
          <dd>Azul parpadeando: está mecanizando. Abajo se enciende el peor semáforo de su cola.</dd>
          <dt><span className="bloque-mini" style={{ background: C.acento }} /> Caja azul</dt>
          <dd>Operación en proceso (la de abajo de la pila).</dd>
          <dt><span className="bloque-mini" style={{ background: C.amarillo }} /> Caja de color</dt>
          <dd>Operación en cola, con el color de su semáforo. Más arriba = más tarde en la cola.</dd>
          <dt><span className="bloque-mini fantasma" /> Caja translúcida</dt>
          <dd>Por liberar: asignada pero el SO sigue en programación, planos o material.</dd>
          <dt><span className="piso-mini" /> Piso teñido</dt>
          <dd>Color del peor semáforo de la máquina.</dd>
          <dt><kbd>▶ +3</kbd> Etiqueta</dt>
          <dd>▶ mecanizando, ‖ detenida con trabajo en cola; +3 = operaciones esperando en cola. Al alejar la cámara solo queda el número de operaciones activas.</dd>
        </dl>
      </section>
      <section className="leyenda-sec">
        <h4>Tipos de máquina</h4>
        <ul className="familias">
          {[...cuenta].sort((a, b) => b[1] - a[1]).map(([f, n]) => <li key={f}>{NOMBRE_FAMILIA[f]} <small>{n}</small></li>)}
        </ul>
        <p className="nota">Formas aproximadas a escala del CAD. Se configuran en config/maquinas.json → familia.</p>
      </section>
      <section className="leyenda-sec">
        <h4>Controles</h4>
        <dl className="leyenda-dl atajos">
          <dt><kbd>Arrastrar</kbd></dt><dd>Mover la planta</dd>
          <dt><kbd>Rueda</kbd></dt><dd>Acercar o alejar</dd>
          <dt><kbd>Clic derecho</kbd> + arrastrar</dt><dd>Girar la vista</dd>
          <dt><kbd>Clic</kbd> en máquina</dt><dd>Ver su cola</dd>
          <dt><kbd>/</kbd></dt><dd>Buscar</dd>
          <dt><kbd>Esc</kbd></dt><dd>Cerrar panel o módulo</dd>
        </dl>
      </section>
    </Cajon>
  );
}

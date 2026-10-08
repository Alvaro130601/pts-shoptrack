import { useEffect, useRef, useState, type ReactNode } from 'react';
import { colorSemaforo } from '../colores';
import { ESTADOS, SEMAFOROS, SIN_FILTROS, activos, alternar, type Filtros as F, type Seccion } from '../filtros';
import { IcoFiltro } from '../iconos';

interface Props {
  filtros: F;
  onCambiar: (f: F) => void;
  procesos: { id: string; nombre: string }[];
  /** Cuántas máquinas quedan resaltadas con esos filtros (y la búsqueda de la barra). */
  contar: (f: F) => number;
  /** Sin fechas de entrega no hay semáforo: la sección de prioridad no aplica. */
  sinSemaforo: boolean;
}

/** Botón "Filtros" de la barra con su panel: prioridad (semáforo), estado de la máquina y proceso. Cada opción dice
 *  cuántas máquinas quedarían si se marca; las que no dejarían ninguna se ven apagadas. */
export function Filtros({ filtros, onCambiar, procesos, contar, sinSemaforo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const n = activos(filtros);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const opcion = (seccion: Seccion, id: string, nombre: string, marca?: ReactNode) => {
    const activa = (filtros[seccion] as string[]).includes(id);
    const cuantas = contar({ ...filtros, [seccion]: [id] });
    return (
      <button key={id} type="button" className={`chip-filtro ${activa ? 'activo' : ''}`} aria-pressed={activa}
        disabled={!activa && cuantas === 0} onClick={() => onCambiar(alternar(filtros, seccion, id))}>
        {marca}{nombre}<small>{cuantas}</small>
      </button>
    );
  };

  return (
    <div className="filtros-ancla" ref={ref}>
      <button type="button" id="filtros" className={`boton-filtros ${n ? 'activo' : ''}`} aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)}>
        <IcoFiltro />Filtros{n > 0 && <span className="n">{n}</span>}
      </button>
      {abierto && (
        <div className="popover filtros tarjeta" role="dialog" aria-label="Filtros de la planta">
          <header>
            <b>Filtrar máquinas</b>
            {n > 0 && <button type="button" className="enlace" onClick={() => onCambiar(SIN_FILTROS)}>Limpiar</button>}
          </header>
          <section>
            <h4>Prioridad <span>· semáforo de sus órdenes</span></h4>
            {sinSemaforo
              ? <span className="nota-filtro">Los SO no traen fecha de entrega: no hay semáforo.</span>
              : <div className="chips">{SEMAFOROS.map(s => opcion('semaforos', s.id, s.nombre, <i className="punto" style={{ background: colorSemaforo(s.id) }} />))}</div>}
          </section>
          <section>
            <h4>Máquina</h4>
            <div className="chips">{ESTADOS.map(e => opcion('estados', e.id, e.nombre))}</div>
          </section>
          <section>
            <h4>Proceso</h4>
            <div className="chips">{procesos.map(p => opcion('procesos', p.id, p.nombre))}</div>
          </section>
          <footer>
            <span>{n ? `${contar(filtros)} máquinas resaltadas` : 'Sin filtros: se ven todas las máquinas'}</span>
            <button type="button" className="boton primario" onClick={() => setAbierto(false)}>Listo</button>
          </footer>
        </div>
      )}
    </div>
  );
}

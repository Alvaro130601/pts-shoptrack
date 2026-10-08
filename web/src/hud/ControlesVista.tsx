import { IcoMas, IcoMenos } from '../iconos';
import type { TallerLayout } from '../tipos-layout';

export function ControlesVista({ talleres, onGeneral, onTaller, onZoom }: {
  talleres: TallerLayout[]; onGeneral: () => void; onTaller: (t: TallerLayout) => void; onZoom: (f: number) => void;
}) {
  const orden = [...talleres].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  return (
    <div className="vista tarjeta" role="toolbar" aria-label="Vista">
      <button onClick={onGeneral} title="Ver toda la planta">General</button>
      {orden.map(t => (
        <button key={t.id} onClick={() => onTaller(t)} title={`Encuadrar ${t.nombre}`}>{t.nombre.replace('Taller #', 'T')}</button>
      ))}
      <span className="vista-sep" />
      <button className="icono" onClick={() => onZoom(1 / 1.35)} aria-label="Alejar"><IcoMenos /></button>
      <button className="icono" onClick={() => onZoom(1.35)} aria-label="Acercar"><IcoMas /></button>
    </div>
  );
}

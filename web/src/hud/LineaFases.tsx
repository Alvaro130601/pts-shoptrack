import type { Fase } from '../../../shared/tipos';

const PASOS: Fase[] = ['Pend. programación', 'Pend. planos', 'Pend. material', 'Producción', 'Calidad', 'Envío'];

export function LineaFases({ fase }: { fase: Fase }) {
  const idx = Math.max(PASOS.indexOf(fase), 0);
  return (
    <div className="fases">
      {PASOS.map((p, i) => (
        <div key={p} className={`fase ${i < idx ? 'hecha' : i === idx ? 'actual' : ''}`}>
          <span className="nodo">{i < idx ? '✓' : ''}</span>
          <span className="lbl">{p.replace('Pend. ', '')}</span>
        </div>
      ))}
    </div>
  );
}

import type { Fase } from '../../../shared/tipos';

const PASOS: Fase[] = ['Pend. programación', 'Pend. planos', 'Pend. material', 'Producción', 'Calidad', 'Envío'];
// Fases opcionales: van después de Producción y antes de Calidad.
const OPCIONALES: Fase[] = ['Servicio externo', 'Ensamble'];

export function LineaFases({ fase }: { fase: Fase }) {
  const pasos = OPCIONALES.includes(fase)
    ? [...PASOS.slice(0, 4), fase, ...PASOS.slice(4)]
    : PASOS;
  const idx = pasos.indexOf(fase);
  return (
    <div className="fases">
      {pasos.map((p, i) => (
        <div key={p} className={`fase ${idx >= 0 && i < idx ? 'hecha' : i === idx ? 'actual' : ''}`}>
          <span className="nodo">{idx >= 0 && i < idx ? '✓' : ''}</span>
          <span className="lbl">{p.replace('Pend. ', '')}</span>
        </div>
      ))}
    </div>
  );
}

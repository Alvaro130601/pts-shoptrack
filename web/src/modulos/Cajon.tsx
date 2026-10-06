import type { ReactNode } from 'react';
import { IcoCerrar } from '../iconos';

/** Contenedor de un módulo del menú lateral: título, ayuda corta y contenido con scroll. */
export function Cajon({ titulo, sub, onCerrar, children, extra }:
  { titulo: string; sub?: string; onCerrar: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="cajon tarjeta" aria-label={titulo}>
      <header>
        <div>
          <h2>{titulo}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        <button className="icono-btn" onClick={onCerrar} aria-label="Cerrar (Esc)" title="Cerrar (Esc)"><IcoCerrar /></button>
      </header>
      {extra}
      <div className="cajon-cuerpo">{children}</div>
    </section>
  );
}

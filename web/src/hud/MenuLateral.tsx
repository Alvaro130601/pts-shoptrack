import type { ReactNode } from 'react';
import { IcoAlerta, IcoBandeja, IcoBuscarSO, IcoCola, IcoInicio, IcoLeyenda } from '../iconos';

export type Modulo = 'cola' | 'alertas' | 'so' | 'sin_maquina' | 'leyenda';

interface Item { id: Modulo; etiqueta: string; icono: ReactNode; badge?: number; tono?: 'rojo' | 'gris' }

interface Props {
  activo: Modulo | null;
  onCambiar: (m: Modulo | null) => void;
  onInicio: () => void;
  atrasadas: number;
  sinMaquina: number;
}

export function MenuLateral({ activo, onCambiar, onInicio, atrasadas, sinMaquina }: Props) {
  const items: Item[] = [
    { id: 'cola', etiqueta: 'Cola', icono: <IcoCola /> },
    { id: 'alertas', etiqueta: 'Alertas', icono: <IcoAlerta />, badge: atrasadas, tono: 'rojo' },
    { id: 'so', etiqueta: 'Buscar SO', icono: <IcoBuscarSO /> },
    { id: 'sin_maquina', etiqueta: 'Sin máquina', icono: <IcoBandeja />, badge: sinMaquina, tono: 'gris' },
  ];
  const boton = (it: Item) => (
    <button key={it.id} className={`menu-item ${activo === it.id ? 'activo' : ''}`}
      aria-pressed={activo === it.id} title={it.etiqueta}
      onClick={() => onCambiar(activo === it.id ? null : it.id)}>
      {it.icono}
      <span>{it.etiqueta}</span>
      {!!it.badge && <i className={`badge ${it.tono ?? ''}`}>{it.badge}</i>}
    </button>
  );
  return (
    <nav className="menu tarjeta" aria-label="Módulos">
      <button className="menu-logo" onClick={onInicio} title="Volver a la vista general" aria-label="Vista general">
        <span>◆</span>
      </button>
      <button className={`menu-item ${activo === null ? 'activo' : ''}`} onClick={onInicio} title="Planta">
        <IcoInicio /><span>Planta</span>
      </button>
      <div className="menu-sep" />
      {items.map(boton)}
      <div className="menu-flex" />
      {boton({ id: 'leyenda', etiqueta: 'Leyenda', icono: <IcoLeyenda /> })}
    </nav>
  );
}

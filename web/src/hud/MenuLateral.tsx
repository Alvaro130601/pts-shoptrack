import type { ReactNode } from 'react';
import { IcoAlerta, IcoAsistente, IcoBandeja, IcoBuscarSO, IcoCola, IcoInicio, IcoLeyenda, IcoMaterial } from '../iconos';

export type Modulo = 'asistente' | 'cola' | 'alertas' | 'so' | 'material' | 'sin_centro' | 'leyenda';

interface Item { id: Modulo; etiqueta: string; icono: ReactNode; badge?: number; tono?: 'rojo' | 'gris' | 'azul'; trabajando?: boolean }

interface Props {
  activo: Modulo | null;
  onCambiar: (m: Modulo | null) => void;
  onInicio: () => void;
  atrasados: number;
  material: number;
  sinCentro: number;
  cambios: number;          // ajustes del supervisor vigentes
  trabajando: boolean;      // el asistente está respondiendo
}

export function MenuLateral({ activo, onCambiar, onInicio, atrasados, material, sinCentro, cambios, trabajando }: Props) {
  const items: Item[] = [
    { id: 'asistente', etiqueta: 'Asistente', icono: <IcoAsistente />, badge: cambios, tono: 'azul', trabajando },
    { id: 'cola', etiqueta: 'Carga', icono: <IcoCola /> },
    { id: 'alertas', etiqueta: 'Alertas', icono: <IcoAlerta />, badge: atrasados, tono: 'rojo' },
    { id: 'so', etiqueta: 'Buscar SO', icono: <IcoBuscarSO /> },
    { id: 'material', etiqueta: 'Material', icono: <IcoMaterial />, badge: material, tono: 'gris' },
    ...(sinCentro ? [{ id: 'sin_centro' as const, etiqueta: 'Sin centro', icono: <IcoBandeja />, badge: sinCentro, tono: 'gris' as const }] : []),
  ];
  const boton = (it: Item) => (
    <button key={it.id} className={`menu-item ${activo === it.id ? 'activo' : ''} ${it.trabajando ? 'trabajando' : ''}`}
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

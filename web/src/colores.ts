export const C = {
  fondo: '#eef1f8', piso: '#fbfcff', pared: '#e1e6f1', acento: '#3b5bfd', tinta: '#1b2440',
  verde: '#1fae7a', amarillo: '#f0a232', rojo: '#e5484d', libre: '#a7b1c6', fuera: '#5d6680',
  cuerpo: '#f3f5fa', techo: '#64708f', zocalo: '#c6cede',
} as const;
export const colorSemaforo = (s?: string) =>
  s === 'rojo' ? C.rojo : s === 'amarillo' ? C.amarillo : s === 'verde' ? C.verde : C.libre;

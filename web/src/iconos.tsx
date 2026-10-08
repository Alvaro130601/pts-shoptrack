// Íconos de trazo (24×24, estilo lucide), dibujados a mano para no cargar una librería.
import type { ReactNode } from 'react';

const Base = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IcoCola = () => <Base><path d="M4 6h16M4 12h10M4 18h6" /><path d="M18 14v6M15 17h6" /></Base>;
export const IcoAlerta = () => <Base><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Base>;
export const IcoBuscarSO = () => <Base><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /><path d="M8.5 11h5M11 8.5v5" /></Base>;
export const IcoBandeja = () => <Base><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" /></Base>;
export const IcoMaterial = () => <Base><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></Base>;
export const IcoLeyenda = () => <Base><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></Base>;
export const IcoCampana = () => <Base><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Base>;
export const IcoInicio = () => <Base><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Base>;
export const IcoMas = () => <Base><path d="M12 5v14M5 12h14" /></Base>;
export const IcoMenos = () => <Base><path d="M5 12h14" /></Base>;
export const IcoCerrar = () => <Base><path d="M18 6 6 18M6 6l12 12" /></Base>;
export const IcoFiltro = () => <Base><path d="M3 5h18l-7 8.5V19l-4 2v-7.5Z" /></Base>;
export const IcoLupa = () => <Base><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Base>;
export const IcoAsistente = () => <Base><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" /><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" /></Base>;

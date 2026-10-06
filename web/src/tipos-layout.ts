export interface ElementoLayout {
  id: string; nombre: string; kind: 'maquina' | 'almacen' | 'otro';
  px: number; py: number; w: number; d: number; h: number; yaw: number;
  footprint: [number, number][]; taller: string | null; proceso_sugerido?: string; cad: string;
}
export interface TallerLayout {
  id: string; nombre: string; footprint: [number, number][]; h?: number; aproximado?: boolean;
}
export interface Layout { talleres: TallerLayout[]; elementos: ElementoLayout[]; advertencias: string[] }

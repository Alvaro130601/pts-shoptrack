import { Canvas } from '@react-three/fiber';
import { useMemo, useState, type Ref } from 'react';
import type { EstadoMaquina } from '../../../shared/tipos';
import type { Layout } from '../tipos-layout';
import { C } from '../colores';
import { Taller } from './Taller';
import { Maquina } from './Maquina';
import { Almacen } from './Almacen';
import { Camara, type CamaraApi, type Caja2D, type Ocupado } from './Camara';

interface Props {
  layout: Layout;
  maquinas: Map<string, EstadoMaquina>;
  seleccion: string | null;
  resaltadas: Set<string> | null; // null = sin filtro
  onSeleccionar: (id: string | null) => void;
  camara: Ref<CamaraApi | null>;
  ocupado: Ocupado;
}

/** Rectángulo que contiene un conjunto de puntos en planta. */
export function cajaDe(pts: [number, number][], margen = 1): Caja2D {
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { x0: Math.min(...xs) - margen, x1: Math.max(...xs) + margen, z0: Math.min(...zs) - margen, z1: Math.max(...zs) + margen };
}

/** Toda la planta: talleres + elementos que quedan fuera de ellos (p. ej. la cortadora láser). */
export const cajaPlanta = (layout: Layout) =>
  cajaDe([...layout.talleres.flatMap(t => t.footprint), ...layout.elementos.flatMap(e => e.footprint)]);

export function Planta({ layout, maquinas, seleccion, resaltadas, onSeleccionar, camara, ocupado }: Props) {
  const [detalle, setDetalle] = useState(false);
  const inicial = useMemo(() => cajaPlanta(layout), [layout]);
  const centro = [(inicial.x0 + inicial.x1) / 2, (inicial.z0 + inicial.z1) / 2] as const;

  return (
    <Canvas
      shadows="percentage"
      orthographic
      dpr={[1, 2]}
      camera={{ position: [centro[0] - 34, 40, centro[1] + 34], zoom: 20, near: -200, far: 500 }}
      onPointerMissed={() => onSeleccionar(null)}
      style={{ background: `linear-gradient(180deg, #f5f7fc 0%, ${C.fondo} 100%)` }}
    >
      <ambientLight intensity={1.5} />
      <hemisphereLight args={['#ffffff', '#c9d2ea', 0.8]} />
      <directionalLight
        castShadow position={[centro[0] - 20, 45, centro[1] + 25]} intensity={1.8}
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40} shadow-bias={-0.0005}
      />
      {/* terreno */}
      <mesh rotation-x={-Math.PI / 2} position={[centro[0], -0.06, centro[1]]} receiveShadow>
        <planeGeometry args={[140, 90]} />
        <meshStandardMaterial color="#e7ebf4" />
      </mesh>

      {layout.talleres.map(t => <Taller key={t.id} t={t} />)}

      {layout.elementos.map(e =>
        e.kind === 'maquina' ? (
          <Maquina key={e.id} e={e} estado={maquinas.get(e.id)}
            seleccionada={seleccion === e.id}
            atenuada={!!resaltadas && !resaltadas.has(e.id)}
            detalle={detalle}
            onClick={() => onSeleccionar(e.id)} />
        ) : <Almacen key={e.id} e={e} atenuada={!!resaltadas} />,
      )}

      <Camara api={camara} inicial={inicial} ocupado={ocupado} onDetalle={setDetalle} />
    </Canvas>
  );
}

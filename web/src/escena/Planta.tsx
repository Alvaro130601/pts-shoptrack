import { Canvas } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { useMemo } from 'react';
import type { EstadoMaquina } from '../../../shared/tipos';
import type { Layout } from '../tipos-layout';
import { C } from '../colores';
import { Taller } from './Taller';
import { Maquina } from './Maquina';
import { Almacen } from './Almacen';

interface Props {
  layout: Layout;
  maquinas: Map<string, EstadoMaquina>;
  seleccion: string | null;
  resaltadas: Set<string> | null; // null = sin filtro
  onSeleccionar: (id: string | null) => void;
}

export function Planta({ layout, maquinas, seleccion, resaltadas, onSeleccionar }: Props) {
  const centro = useMemo(() => {
    const pts = layout.talleres.flatMap(t => t.footprint);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...ys) + Math.max(...ys)) / 2;
    // Desplaza el objetivo para que la planta quede arriba-derecha, libre de la tabla inferior izquierda.
    // Derecha en pantalla ≈ (+1,0,+1); arriba ≈ (+1,0,−1).
    const k = Math.SQRT1_2;
    return [cx - 7 * k - 3 * k, 0, cz - 7 * k + 3 * k] as const;
  }, [layout]);
  // Encuadre: ancho isométrico ≈ (largo + ancho)·cos45°; se deja margen para el HUD
  const zoom = useMemo(() => {
    const pts = [...layout.talleres.flatMap(t => t.footprint), ...layout.elementos.flatMap(e => e.footprint)];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const span = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * 0.72;
    return Math.max(10, (window.innerWidth * 0.62) / span);
  }, [layout]);

  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      camera={{ position: [centro[0] - 34, 40, centro[2] + 34], zoom, near: -200, far: 500 }}
      onPointerMissed={() => onSeleccionar(null)}
      style={{ background: `linear-gradient(180deg, #f5f7fc 0%, ${C.fondo} 100%)` }}
    >
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#ffffff', '#c9d2ea', 0.8]} />
      <directionalLight
        castShadow position={[centro[0] - 20, 45, centro[2] + 25]} intensity={1.8}
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40} shadow-bias={-0.0005}
      />
      {/* terreno */}
      <mesh rotation-x={-Math.PI / 2} position={[centro[0], -0.06, centro[2]]} receiveShadow>
        <planeGeometry args={[140, 90]} />
        <meshStandardMaterial color="#e7ebf4" />
      </mesh>

      {layout.talleres.map(t => <Taller key={t.id} t={t} />)}

      {layout.elementos.map(e =>
        e.kind === 'maquina' ? (
          <Maquina key={e.id} e={e} estado={maquinas.get(e.id)}
            seleccionada={seleccion === e.id}
            atenuada={!!resaltadas && !resaltadas.has(e.id)}
            onClick={() => onSeleccionar(e.id)} />
        ) : <Almacen key={e.id} e={e} atenuada={!!resaltadas} />,
      )}

      <MapControls target={centro as unknown as [number, number, number]} enableRotate maxPolarAngle={Math.PI / 2.4}
        minZoom={8} maxZoom={90} screenSpacePanning />
    </Canvas>
  );
}

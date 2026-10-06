import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
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

/** Toda la planta: talleres + elementos, también los que quedan fuera de un taller. */
export const cajaPlanta = (layout: Layout) =>
  cajaDe([...layout.talleres.flatMap(t => t.footprint), ...layout.elementos.flatMap(e => e.footprint)]);

export function Planta({ layout, maquinas, seleccion, resaltadas, onSeleccionar, camara, ocupado }: Props) {
  const [detalle, setDetalle] = useState(false);
  const inicial = useMemo(() => cajaPlanta(layout), [layout]);
  const centro = [(inicial.x0 + inicial.x1) / 2, (inicial.z0 + inicial.z1) / 2] as const;
  // Las máquinas se dibujan cuando llegan los datos: antes saldrían con el modelo genérico y se rehacían todas.
  const conDatos = maquinas.size > 0;

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
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40} shadow-bias={-0.0005}
      />
      {/* terreno */}
      <mesh rotation-x={-Math.PI / 2} position={[centro[0], -0.06, centro[1]]} receiveShadow>
        <planeGeometry args={[140, 90]} />
        <meshStandardMaterial color="#dfe3e8" />
      </mesh>

      {layout.talleres.map(t => <Taller key={t.id} t={t} />)}

      {layout.elementos.map(e =>
        e.kind === 'maquina' ? (conDatos &&
          <Maquina key={e.id} e={e} estado={maquinas.get(e.id)}
            seleccionada={seleccion === e.id}
            atenuada={!!resaltadas && !resaltadas.has(e.id)}
            detalle={detalle}
            onClick={() => onSeleccionar(e.id)} />
        ) : <Almacen key={e.id} e={e} atenuada={!!resaltadas} />,
      )}

      <Camara api={camara} inicial={inicial} ocupado={ocupado} onDetalle={setDetalle} />
      <Medidor datos={maquinas} />
    </Canvas>
  );
}

/** Mide cómo se mueve la planta en el equipo de quien la mira: duración de los cuadros durante 90 s y el peor salto
 *  en los 3 s después de cada cambio de datos. Lo avisa una vez con el evento `shoptrack-rendimiento` (la página
 *  publicada lo guarda en su diagnóstico). */
function Medidor({ datos }: { datos: unknown }) {
  const gl = useThree(s => s.gl);
  const m = useRef({ t: 0, cuadros: [] as number[], cambio: -1, salto: 0, saltos: [] as number[], listo: false });
  useEffect(() => { m.current.cambio = m.current.t; }, [datos]);
  useFrame((_, dt) => {
    const x = m.current;
    if (x.listo) return;
    x.t += dt;
    const ms = dt * 1000;
    x.cuadros.push(ms);
    if (x.cambio >= 0 && x.t - x.cambio < 3) x.salto = Math.max(x.salto, ms);
    else if (x.cambio >= 0) { x.saltos.push(Math.round(x.salto)); x.salto = 0; x.cambio = -1; }
    if (x.t < 90) return;
    x.listo = true;
    const orden = [...x.cuadros].sort((a, b) => a - b);
    const q = (p: number) => Math.round(orden[Math.min(orden.length - 1, Math.floor(orden.length * p))]);
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    window.dispatchEvent(new CustomEvent('shoptrack-rendimiento', { detail: {
      cuadros: orden.length, mediana_ms: q(0.5), p95_ms: q(0.95), max_ms: q(1), lentos: orden.filter(v => v > 100).length,
      saltos_al_cambiar_datos_ms: x.saltos, dpr: gl.getPixelRatio(),
      gpu: ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 120) : null,
    } }));
  });
  return null;
}

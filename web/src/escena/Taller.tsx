import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { TallerLayout } from '../tipos-layout';
import { C } from '../colores';

const ALTO_MURO = 2.4;
const ANCHO_FRANJA = 0.16;
const SEP_FRANJA = 0.45;   // de la pared hacia adentro
/** Color de cada taller para ubicarse de un vistazo: piso teñido, franja pintada junto a las paredes, paredes con un
 *  remate más oscuro arriba y la etiqueta. Piso claro (OKLCH L 0.95, C 0.03) en un tono que contrasta con el color de
 *  las máquinas que tiene adentro, para que no se pierdan; la etiqueta pasa 4.5:1 sobre su piso. */
const TINTES: Record<string, { piso: string; franja: string; pared: string; remate: string; texto: string }> = {
  'taller-1': { piso: '#ddf2ff', franja: '#8ec6e7', pared: '#b7dcf3', remate: '#5da1c8', texto: '#01729f' },  // celeste
  'taller-2': { piso: '#f9edd9', franja: '#d7b986', pared: '#e7d3b1', remate: '#b69255', texto: '#896105' },  // arena
  'taller-3': { piso: '#def5e8', franja: '#93cdad', pared: '#bae1cb', remate: '#64aa85', texto: '#177c52' },  // menta
  'taller-4': { piso: '#feeae0', franja: '#e8af96', pared: '#f3ccbb', remate: '#c78669', texto: '#9c522e' },  // melocotón
};
const NEUTRO = { piso: C.piso, franja: '#d7dde9', pared: C.pared, remate: '#aab3c6', texto: '#8a93ad' };

export function Taller({ t }: { t: TallerLayout }) {
  const tinte = TINTES[t.id] ?? NEUTRO;
  const forma = useMemo(() => {
    const s = new THREE.Shape();
    t.footprint.forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)));
    s.closePath();
    return s;
  }, [t]);

  // Muros altos solo al fondo (lado opuesto a la cámara) para ver el interior, como en un juego de estrategia.
  // La franja del piso va paralela a cada muro, un poco hacia adentro.
  const muros = useMemo(() => {
    const cx = t.footprint.reduce((s, p) => s + p[0], 0) / t.footprint.length;
    const cz = t.footprint.reduce((s, p) => s + p[1], 0) / t.footprint.length;
    return t.footprint.map((p, i) => {
      const q = t.footprint[(i + 1) % t.footprint.length];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const largo = Math.hypot(dx, dz);
      const x = (p[0] + q[0]) / 2, z = (p[1] + q[1]) / 2;
      const haciaCamara = (x - cx) * -1 + (z - cz) * 1 > 0; // cámara en (−x, +z)
      // normal hacia el centro del taller
      let nx = -dz / largo, nz = dx / largo;
      if (nx * (cx - x) + nz * (cz - z) < 0) { nx = -nx; nz = -nz; }
      return { x, z, largo, rot: -Math.atan2(dz, dx), alto: haciaCamara ? 0.35 : ALTO_MURO, nx, nz };
    });
  }, [t]);

  const esquina = t.footprint.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a));
  const opMuro = t.aproximado ? 0.35 : 0.92;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <extrudeGeometry args={[forma, { depth: 0.08, bevelEnabled: false }]} />
        <meshStandardMaterial color={tinte.piso} />
      </mesh>
      {!t.aproximado && muros.map((m, i) => (
        <mesh key={`f${i}`} position={[m.x + m.nx * SEP_FRANJA, 0.095, m.z + m.nz * SEP_FRANJA]} rotation-y={m.rot} receiveShadow>
          <boxGeometry args={[Math.max(m.largo - 2 * SEP_FRANJA, 0.1), 0.01, ANCHO_FRANJA]} />
          <meshStandardMaterial color={tinte.franja} />
        </mesh>
      ))}
      {muros.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} rotation-y={m.rot}>
          <mesh position-y={m.alto / 2} castShadow receiveShadow>
            <boxGeometry args={[m.largo, m.alto, 0.14]} />
            <meshStandardMaterial color={tinte.pared} transparent opacity={opMuro} />
          </mesh>
          <mesh position-y={m.alto + 0.03}>
            <boxGeometry args={[m.largo, 0.06, 0.18]} />
            <meshStandardMaterial color={tinte.remate} transparent opacity={opMuro} />
          </mesh>
        </group>
      ))}
      <Html position={[esquina[0] + 0.6, 0.1, esquina[1] + 0.6]} center={false} zIndexRange={[5, 0]}
        style={{ pointerEvents: 'none' }}>
        <div className="etiqueta-taller" style={{ color: tinte.texto }}
          title={t.aproximado ? 'Contorno aproximado: no viene en el CAD' : undefined}>{t.nombre}</div>
      </Html>
    </group>
  );
}

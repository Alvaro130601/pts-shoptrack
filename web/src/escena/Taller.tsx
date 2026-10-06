import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { TallerLayout } from '../tipos-layout';
import { C } from '../colores';

const ALTO_MURO = 2.4;

export function Taller({ t }: { t: TallerLayout }) {
  const forma = useMemo(() => {
    const s = new THREE.Shape();
    t.footprint.forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)));
    s.closePath();
    return s;
  }, [t]);

  // Muros altos solo al fondo (lado opuesto a la cámara) para ver el interior, como en un juego de estrategia
  const muros = useMemo(() => {
    const cx = t.footprint.reduce((s, p) => s + p[0], 0) / t.footprint.length;
    const cz = t.footprint.reduce((s, p) => s + p[1], 0) / t.footprint.length;
    return t.footprint.map((p, i) => {
      const q = t.footprint[(i + 1) % t.footprint.length];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const x = (p[0] + q[0]) / 2, z = (p[1] + q[1]) / 2;
      const haciaCamara = (x - cx) * -1 + (z - cz) * 1 > 0; // cámara en (−x, +z)
      return { x, z, largo: Math.hypot(dx, dz), rot: -Math.atan2(dz, dx), alto: haciaCamara ? 0.35 : ALTO_MURO };
    });
  }, [t]);

  const esquina = t.footprint.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a));

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <extrudeGeometry args={[forma, { depth: 0.08, bevelEnabled: false }]} />
        <meshStandardMaterial color={t.aproximado ? '#f1f3f9' : C.piso} />
      </mesh>
      {muros.map((m, i) => (
        <mesh key={i} position={[m.x, m.alto / 2, m.z]} rotation-y={m.rot} castShadow receiveShadow>
          <boxGeometry args={[m.largo, m.alto, 0.14]} />
          <meshStandardMaterial color={C.pared} transparent opacity={t.aproximado ? 0.35 : 0.92} />
        </mesh>
      ))}
      <Html position={[esquina[0] + 0.6, 0.1, esquina[1] + 0.6]} center={false} zIndexRange={[5, 0]}
        style={{ pointerEvents: 'none' }}>
        <div className="etiqueta-taller" title={t.aproximado ? 'Contorno aproximado: no viene en el CAD' : undefined}>{t.nombre}</div>
      </Html>
    </group>
  );
}

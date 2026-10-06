import type { ElementoLayout } from '../tipos-layout';

export function Almacen({ e, atenuada }: { e: ElementoLayout; atenuada: boolean }) {
  const morado = e.nombre.includes('morado');
  const bines = e.nombre.includes('bines');
  const color = morado ? '#a996e6' : bines ? '#8fb2f0' : '#b9c2d6';
  const niveles = 4;
  const op = atenuada ? 0.25 : 1;
  return (
    <group position={[e.px, 0, e.py]} rotation-y={e.yaw}>
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[(sx * e.w) / 2 * 0.95, e.h / 2, (sz * e.d) / 2 * 0.9]} castShadow>
          <boxGeometry args={[0.06, e.h, 0.06]} />
          <meshStandardMaterial color={color} transparent opacity={op} />
        </mesh>
      ))}
      {Array.from({ length: niveles }, (_, i) => (
        <mesh key={i} position={[0, 0.1 + (i * e.h) / niveles, 0]} castShadow receiveShadow>
          <boxGeometry args={[e.w * 0.95, 0.05, e.d * 0.9]} />
          <meshStandardMaterial color={color} transparent opacity={op} />
        </mesh>
      ))}
    </group>
  );
}

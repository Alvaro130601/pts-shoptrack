import { Html, RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type * as THREE from 'three';
import type { EstadoMaquina, Operacion } from '../../../shared/tipos';
import type { ElementoLayout } from '../tipos-layout';
import { C, colorSemaforo } from '../colores';

const MAX_PILA = 6;
const ALTO_BLOQUE = 0.32;

interface Props {
  e: ElementoLayout;
  estado?: EstadoMaquina;
  seleccionada: boolean;
  atenuada: boolean;
  onClick: () => void;
}

export function Maquina({ e, estado, seleccionada, atenuada, onClick }: Props) {
  const [hover, setHover] = useState(false);
  const baliza = useRef<THREE.MeshStandardMaterial>(null);
  const trabajando = (estado?.en_proceso.length ?? 0) > 0;
  const sem = estado?.semaforo ?? 'libre';
  const h = Math.min(e.h, 2.8);
  const op = atenuada ? 0.18 : 1;

  useFrame(({ clock }) => {
    if (baliza.current) baliza.current.emissiveIntensity = trabajando ? 0.6 + Math.sin(clock.elapsedTime * 4) * 0.5 : 0.15;
  });

  const realce = seleccionada || hover;
  const pila: Operacion[] = estado ? [...estado.en_proceso, ...estado.cola, ...estado.por_liberar] : [];
  const visibles = pila.slice(0, MAX_PILA);
  const extra = pila.length - visibles.length;

  return (
    <group position={[e.px, 0, e.py]}>
      {/* cuerpo de la máquina, orientado según el CAD */}
      <group
        rotation-y={e.yaw}
        onClick={ev => { ev.stopPropagation(); onClick(); }}
        onPointerOver={ev => { ev.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      >
        <mesh position-y={0.07} castShadow receiveShadow>
          <boxGeometry args={[e.w, 0.14, e.d]} />
          <meshStandardMaterial color={C.zocalo} transparent opacity={op} />
        </mesh>
        <RoundedBox args={[e.w * 0.94, h * 0.68, e.d * 0.94]} radius={0.08} smoothness={2}
          position-y={0.14 + (h * 0.68) / 2} castShadow receiveShadow>
          <meshStandardMaterial color={realce ? '#ffffff' : C.cuerpo} emissive={realce ? C.acento : '#000'}
            emissiveIntensity={realce ? 0.12 : 0} transparent opacity={op} />
        </RoundedBox>
        <mesh position-y={0.14 + h * 0.68 + h * 0.08} castShadow>
          <boxGeometry args={[e.w * 0.9, h * 0.16, e.d * 0.9]} />
          <meshStandardMaterial color={C.techo} transparent opacity={op} />
        </mesh>
        {/* franja de estado */}
        <mesh position-y={0.14 + h * 0.68 - 0.06}>
          <boxGeometry args={[e.w * 0.95, 0.08, e.d * 0.95]} />
          <meshStandardMaterial color={colorSemaforo(sem)} transparent opacity={op} />
        </mesh>
        {/* baliza / andon */}
        <mesh position={[e.w * 0.38, 0.14 + h * 0.84 + 0.22, e.d * 0.38]}>
          <cylinderGeometry args={[0.09, 0.09, 0.3, 12]} />
          <meshStandardMaterial ref={baliza} color={trabajando ? C.acento : C.libre}
            emissive={trabajando ? C.acento : C.libre} transparent opacity={op} />
        </mesh>
        {seleccionada && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
            <ringGeometry args={[Math.max(e.w, e.d) * 0.62, Math.max(e.w, e.d) * 0.68, 48]} />
            <meshBasicMaterial color={C.acento} />
          </mesh>
        )}
      </group>

      {/* pila de órdenes sobre la máquina */}
      {!atenuada && visibles.map((o, i) => (
        <Bloque key={o.id} op={o} y={h + 0.55 + i * (ALTO_BLOQUE + 0.06)} />
      ))}

      {!atenuada && (
        <Html position={[0, h + 0.7 + visibles.length * (ALTO_BLOQUE + 0.06), 0]} center zIndexRange={[20, 10]}
          style={{ pointerEvents: 'none' }}>
          <div className={`chip-maquina ${realce ? 'activo' : ''} ${estado?.es_centro_mecanizado === false ? 'secundaria' : ''}`}>
            <span className="punto" style={{ background: colorSemaforo(sem) }} />
            <b>{estado?.nombre ?? e.nombre}</b>
            {estado && estado.en_proceso.length + estado.cola.length > 0 && (
              <span className="cuenta">{estado.en_proceso.length ? '▶' : '‖'} {estado.cola.length}{extra > 0 ? `+${extra}` : ''}</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function Bloque({ op, y }: { op: Operacion; y: number }) {
  const ref = useRef<THREE.Group>(null);
  const enProceso = op.estado_cola === 'en_proceso';
  useFrame(({ clock }) => {
    if (ref.current && enProceso) ref.current.position.y = y + Math.sin(clock.elapsedTime * 2.2) * 0.05;
  });
  const color = enProceso ? C.acento : colorSemaforo(op.semaforo);
  const fantasma = op.estado_cola === 'por_liberar';
  return (
    <group ref={ref} position-y={y}>
      <RoundedBox args={[0.95, ALTO_BLOQUE, 0.95]} radius={0.06} smoothness={2} castShadow={!fantasma}>
        <meshStandardMaterial color={color} transparent opacity={fantasma ? 0.28 : 0.95}
          emissive={color} emissiveIntensity={enProceso ? 0.25 : 0.05} />
      </RoundedBox>
    </group>
  );
}

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EstadoMaquina, Operacion, Semaforo } from '../../../shared/tipos';
import type { ElementoLayout } from '../tipos-layout';
import { C, colorSemaforo } from '../colores';
import { ModeloCtx, ModeloMaquina } from './modelos';

const MAX_PILA = 6;
const ALTO_BLOQUE = 0.22;
const SEP_BLOQUE = 0.06;

/** Una caja redondeada por tamaño, compartida por todas las pilas. Antes cada orden armaba la suya y, al cambiar los
 *  datos (p. ej. al llegar los de Zoho), se rehacían todas a la vez y la cámara se trababa. */
const cajas = new Map<number, THREE.BufferGeometry>();
function cajaBloque(lado: number) {
  const k = Math.round(lado * 100) / 100;
  let g = cajas.get(k);
  if (!g) cajas.set(k, g = new RoundedBoxGeometry(k, ALTO_BLOQUE, k, 2, 0.05));
  return g;
}

interface Props {
  e: ElementoLayout;
  estado?: EstadoMaquina;
  seleccionada: boolean;
  atenuada: boolean;
  /** false = cámara lejos: la etiqueta se reduce a un punto con el conteo */
  detalle: boolean;
  onClick: () => void;
}

export function Maquina({ e, estado, seleccionada, atenuada, detalle, onClick }: Props) {
  const [hover, setHover] = useState(false);
  const trabajando = (estado?.en_proceso.length ?? 0) > 0;
  const sem = estado?.semaforo ?? 'libre';
  const fuera = !!estado?.fuera_de_servicio;
  const h = Math.min(e.h, 2.8);
  const op = atenuada ? 0.18 : 1;
  const realce = seleccionada || hover;

  const pila: Operacion[] = estado ? [...estado.en_proceso, ...estado.cola, ...estado.proximas] : [];
  const visibles = pila.slice(0, MAX_PILA);
  const lado = Math.max(0.4, Math.min(0.72, Math.min(e.w, e.d) * 0.5));
  const yPila = h + 0.45;
  const activas = (estado?.en_proceso.length ?? 0) + (estado?.cola.length ?? 0);
  const secundaria = estado?.es_centro_mecanizado === false;
  const mostrarChip = !atenuada && (realce || fuera || (!secundaria && (detalle || activas > 0)));

  return (
    <group position={[e.px, 0, e.py]}>
      <group
        rotation-y={e.yaw}
        onClick={ev => { ev.stopPropagation(); onClick(); }}
        onPointerOver={ev => { ev.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      >
        <Huella w={e.w} d={e.d} color={fuera ? C.fuera : colorSemaforo(sem)} op={op} libre={sem === 'libre' && !fuera} />
        <ModeloCtx.Provider value={{ op, realce }}>
          <group position-y={0.022}>
            <ModeloMaquina familia={estado?.familia} w={e.w} d={e.d} h={h} />
          </group>
        </ModeloCtx.Provider>
        <Andon x={e.w / 2 - 0.1} z={-e.d / 2 + 0.1} alto={h + 0.15} sem={sem} trabajando={trabajando} op={op} />
        {seleccionada && <Marco w={e.w + 0.7} d={e.d + 0.7} g={0.12} color={C.acento} y={0.03} />}
      </group>

      {/* pila de órdenes sobre la máquina: una caja por operación. Por posición, no por orden: cuando cambian los
          datos las cajas se recolorean en vez de rehacerse. */}
      {!atenuada && visibles.map((o, i) => (
        <Bloque key={i} op={o} lado={lado} y={yPila + i * (ALTO_BLOQUE + SEP_BLOQUE)} />
      ))}

      {mostrarChip && (
        <Html position={[0, yPila + 0.2 + visibles.length * (ALTO_BLOQUE + SEP_BLOQUE), 0]} center zIndexRange={[20, 10]}
          style={{ pointerEvents: 'none' }}>
          {fuera ? (
            <div className={`chip-maquina fuera ${realce ? 'activo' : ''}`} title={estado!.fuera_de_servicio}>
              <span className="punto" />
              <b>{estado!.nombre}</b>
              <span className="cuenta">fuera de servicio</span>
            </div>
          ) : detalle || realce ? (
            <div className={`chip-maquina ${realce ? 'activo' : ''} ${secundaria ? 'secundaria' : ''}`}>
              <span className="punto" style={{ background: colorSemaforo(sem) }} />
              <b>{estado?.nombre ?? e.nombre}</b>
              {activas > 0 && (
                <span className="cuenta">{trabajando ? '▶' : '‖'}{estado!.cola.length > 0 ? ` +${estado!.cola.length}` : ''}</span>
              )}
            </div>
          ) : (
            <div className="chip-mini" style={{ background: colorSemaforo(sem) }}>{activas}</div>
          )}
        </Html>
      )}
    </group>
  );
}

/** Huella en el piso: relleno muy suave y marco del color del semáforo (legible sin saturar en máquinas grandes). */
function Huella({ w, d, color, op, libre }: { w: number; d: number; color: string; op: number; libre: boolean }) {
  const W = w + 0.28, D = d + 0.28;
  return (
    <group position-y={0.012}>
      <mesh receiveShadow>
        <boxGeometry args={[W, 0.012, D]} />
        <meshStandardMaterial color={color} transparent opacity={(libre ? 0.08 : 0.14) * op} depthWrite={false} />
      </mesh>
      <Marco w={W} d={D} g={0.1} color={color} opacidad={(libre ? 0.35 : 0.85) * op} y={0.004} />
    </group>
  );
}

/** Marco rectangular plano (contorno) de ancho w, fondo d y grosor g. */
function Marco({ w, d, g, color, opacidad = 1, y }: { w: number; d: number; g: number; color: string; opacidad?: number; y: number }) {
  const lados: [number, number, number, number][] = [
    [0, d / 2 - g / 2, w, g], [0, -d / 2 + g / 2, w, g], [w / 2 - g / 2, 0, g, d], [-w / 2 + g / 2, 0, g, d],
  ];
  return (
    <group position-y={y}>
      {lados.map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[sx, 0.014, sz]} />
          <meshStandardMaterial color={color} transparent={opacidad < 1} opacity={opacidad} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Torre de luces tipo andon: azul = mecanizando; rojo/amarillo/verde = peor semáforo de la cola. */
function Andon({ x, z, alto, sem, trabajando, op }:
  { x: number; z: number; alto: number; sem: Semaforo | 'libre'; trabajando: boolean; op: number }) {
  const azul = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (azul.current) azul.current.emissiveIntensity = trabajando ? 0.7 + Math.sin(clock.elapsedTime * 4) * 0.5 : 0;
  });
  const luces: { c: string; on: boolean; ref?: typeof azul }[] = [
    { c: C.acento, on: trabajando, ref: azul },
    { c: C.rojo, on: sem === 'rojo' },
    { c: C.amarillo, on: sem === 'amarillo' },
    { c: C.verde, on: sem === 'verde' },
  ];
  const seg = 0.11;
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={alto / 2}>
        <cylinderGeometry args={[0.018, 0.018, alto, 8]} />
        <meshStandardMaterial color="#8a93ad" transparent opacity={op} />
      </mesh>
      {luces.map((l, i) => (
        <mesh key={l.c} position-y={alto + (luces.length - i - 0.5) * seg}>
          <cylinderGeometry args={[0.065, 0.065, seg * 0.92, 16]} />
          <meshStandardMaterial ref={l.ref} color={l.on ? l.c : '#d5dae6'} emissive={l.on ? l.c : '#000000'}
            emissiveIntensity={l.on ? 0.7 : 0} transparent opacity={(l.on ? 1 : 0.55) * op} />
        </mesh>
      ))}
    </group>
  );
}

function Bloque({ op, y, lado }: { op: Operacion; y: number; lado: number }) {
  const ref = useRef<THREE.Group>(null);
  const enProceso = op.estado === 'en_proceso';
  useFrame(({ clock }) => {
    if (ref.current && enProceso) ref.current.position.y = y + Math.sin(clock.elapsedTime * 2.2) * 0.04;
  });
  const color = enProceso ? C.acento : colorSemaforo(op.semaforo);
  const fantasma = op.estado === 'en_camino' || op.estado === 'bloqueada';
  return (
    <group ref={ref} position-y={y}>
      {/* dispose={null}: la geometría es compartida, no se descarta al quitar la caja */}
      <mesh geometry={cajaBloque(lado)} castShadow={!fantasma} dispose={null}>
        <meshStandardMaterial color={color} transparent opacity={fantasma ? 0.3 : 0.95}
          emissive={color} emissiveIntensity={enProceso ? 0.25 : 0.05} />
      </mesh>
    </group>
  );
}

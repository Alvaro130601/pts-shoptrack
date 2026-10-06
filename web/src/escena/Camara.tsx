import { MapControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import * as THREE from 'three';

/** Rectángulo en planta (metros): x = px, z = py. */
export interface Caja2D { x0: number; x1: number; z0: number; z1: number }

export interface CamaraApi {
  /** Encuadra un rectángulo de la planta con animación, sin acercarse más que `zoomMax`. */
  encuadrar(c: Caja2D, zoomMax?: number): void;
  /** Multiplica el zoom actual (con animación). */
  zoom(factor: number): void;
}

/** Píxeles tapados por el HUD a cada lado (menú, cajón, panel, barra, pie). */
export interface Ocupado { izq: number; der: number; arr: number; aba: number }

interface Props {
  api: Ref<CamaraApi | null>;
  inicial: Caja2D;
  ocupado: Ocupado;
  /** Se llama al cruzar el umbral de zoom donde las etiquetas pasan a modo compacto. */
  onDetalle: (detalle: boolean) => void;
}

const UMBRAL_DETALLE = 30;
export function Camara({ api, inicial, ocupado, onDetalle }: Props) {
  const { camera, size } = useThree();
  // Mientras la cámara se mueve, la planta se dibuja a menos resolución (AdaptiveDpr): en equipos con gráficos
  // modestos el movimiento sigue fluido y al soltar vuelve la nitidez.
  const regress = useThree(s => s.performance.regress);
  const hud = useRef(ocupado);
  hud.current = ocupado;
  const controles = useRef<any>(null);
  const destino = useRef<{ target: THREE.Vector3; zoom: number } | null>(null);
  const detalle = useRef<boolean | null>(null);

  const zoomPara = (c: Caja2D, zoomMax = 90) => {
    // En la vista isométrica el ancho en pantalla ≈ (Δx + Δz)·cos45° y el alto ≈ la mitad de eso.
    const ancho = (c.x1 - c.x0 + c.z1 - c.z0) * Math.SQRT1_2;
    const alto = ancho * 0.5;
    const o = hud.current;
    const zw = Math.max(200, size.width - o.izq - o.der - 40) / ancho;
    const zh = Math.max(200, size.height - o.arr - o.aba - 40) / alto;
    return THREE.MathUtils.clamp(Math.min(zw, zh), 8, zoomMax);
  };

  const encuadrar = (c: Caja2D, animar = true, zoomMax?: number) => {
    const zoom = zoomPara(c, zoomMax);
    // Centra el rectángulo en el área visible (entre cajón y panel), no en el centro del lienzo.
    const o = hud.current;
    const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const dx = (o.izq - o.der) / 2 / zoom, dy = (o.arr - o.aba) / 2 / zoom;
    const target = new THREE.Vector3((c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2)
      .addScaledVector(derecha, -dx).addScaledVector(arriba, dy);
    target.y = 0;
    if (!animar && controles.current) {
      const off = camera.position.clone().sub(controles.current.target);
      controles.current.target.copy(target);
      camera.position.copy(target).add(off);
      (camera as THREE.OrthographicCamera).zoom = zoom;
      camera.updateProjectionMatrix();
      controles.current.update();
      return;
    }
    destino.current = { target, zoom };
  };

  useImperativeHandle(api, () => ({
    encuadrar: (c, zoomMax) => encuadrar(c, true, zoomMax),
    zoom: f => {
      const ctl = controles.current;
      if (!ctl) return;
      destino.current = {
        target: (destino.current?.target ?? ctl.target).clone(),
        zoom: THREE.MathUtils.clamp((destino.current?.zoom ?? camera.zoom) * f, 8, 90),
      };
    },
  }));

  // Encuadre inicial sin animación, una vez que existen los controles.
  useEffect(() => { encuadrar(inicial, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const ctl = controles.current;
    const cam = camera as THREE.OrthographicCamera;
    const dst = destino.current;
    if (ctl && dst) {
      const k = 1 - Math.exp(-dt * 6);
      const antes = ctl.target.clone();
      ctl.target.lerp(dst.target, k);
      camera.position.add(ctl.target.clone().sub(antes));
      cam.zoom += (dst.zoom - cam.zoom) * k;
      cam.updateProjectionMatrix();
      ctl.update();
      if (ctl.target.distanceTo(dst.target) < 0.01 && Math.abs(cam.zoom - dst.zoom) < 0.05) destino.current = null;
    }
    const d = cam.zoom >= UMBRAL_DETALLE;
    if (d !== detalle.current) { detalle.current = d; onDetalle(d); }
  });

  return (
    <MapControls ref={controles} makeDefault enableRotate enableDamping dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2.4} minZoom={8} maxZoom={90} screenSpacePanning
      onStart={() => { destino.current = null; }} onChange={() => regress()} />
  );
}

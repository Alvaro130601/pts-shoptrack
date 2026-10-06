// Formas aproximadas por familia de máquina, armadas con primitivas y escaladas a la huella real del CAD.
// Ejes locales: x = ancho (w), z = fondo (d), y = alto. Se asume el frente de la máquina hacia +z.
import { Edges } from '@react-three/drei';
import { createContext, useContext, type ReactNode } from 'react';
import type { FamiliaMaquina } from '../../../shared/tipos';
import { C } from '../colores';

// Paleta suave a propósito: el color fuerte queda reservado para el estado (semáforo, azul = en proceso).
type Tono = 'cuerpo' | 'techo' | 'oscuro' | 'metal' | 'vidrio' | 'panel' | 'pintura';
const TONOS: Record<Tono, string> = {
  cuerpo: '#eceff6', techo: '#d6dce8', oscuro: '#7f89a2', metal: '#b7bfcd', vidrio: '#a9cdf2', panel: '#2b3550', pintura: '#a2adbf',
};

/** Pintura de cada tipo de máquina: tonos apagados que distinguen la familia sin competir con los colores de estado. */
const PALETAS: Partial<Record<FamiliaMaquina, Partial<Record<Tono, string>>>> = {
  fresadora_cnc: { pintura: '#8aa1d1', cuerpo: '#e3eafa', techo: '#b7c6e9' },  // azul acero
  fresadora_convencional: { pintura: '#7fb2a2', cuerpo: '#edf5f2' },  // verde máquina
  torno_cnc: { pintura: '#72a8c1', cuerpo: '#e1eff5', techo: '#accfdd' },      // azul petróleo
  torno_suizo: { pintura: '#6eb0b2', cuerpo: '#e2f2f2', techo: '#a9d3d3' },    // turquesa
  torno_convencional: { pintura: '#93b487', cuerpo: '#f0f5ed' },      // verde salvia
  edm_hilo: { pintura: '#a598d4', cuerpo: '#f2f0fa', oscuro: '#8a82ad' }, // lavanda
  rectificadora: { pintura: '#c8aa83', cuerpo: '#f8f3ec' },           // arena
  horno: { pintura: '#cf9a84', oscuro: '#ad8a80' },                    // terracota
  laser: { pintura: '#d0a978', cuerpo: '#faf5ee' },                    // ocre
  dobladora: { pintura: '#86a5c8' }, guillotina: { pintura: '#9fae8b' }, soldadora: { pintura: '#c79b87' },
};

/** Color de pintura de una familia (para la leyenda). */
export const colorFamilia = (f: FamiliaMaquina) => PALETAS[f]?.pintura ?? TONOS.pintura;

interface Ctx { op: number; realce: boolean }
export const ModeloCtx = createContext<Ctx>({ op: 1, realce: false });
const PaletaCtx = createContext<Partial<Record<Tono, string>>>({});

function Mat({ t }: { t: Tono }) {
  const { op, realce } = useContext(ModeloCtx);
  const paleta = useContext(PaletaCtx);
  const vidrio = t === 'vidrio';
  const resalta = realce && t === 'cuerpo';
  return (
    <meshStandardMaterial
      color={resalta ? '#ffffff' : paleta[t] ?? TONOS[t]}
      emissive={resalta ? C.acento : '#000000'} emissiveIntensity={resalta ? 0.14 : 0}
      metalness={t === 'metal' ? 0.35 : 0.05} roughness={vidrio ? 0.15 : 0.7}
      transparent opacity={(vidrio ? 0.5 : 1) * op} depthWrite={!vidrio && op === 1} />
  );
}

type V3 = [number, number, number];
/** Caja apoyada: `p` es el centro en x/z y la BASE en y. Lleva aristas finas para leer la forma sobre el piso claro. */
function Caja({ s, p, t = 'cuerpo', r }: { s: V3; p: V3; t?: Tono; r?: V3 }) {
  const { op } = useContext(ModeloCtx);
  const pos: V3 = [p[0], p[1] + s[1] / 2, p[2]];
  return (
    <mesh position={pos} rotation={r} castShadow={t !== 'vidrio'} receiveShadow>
      <boxGeometry args={s} />
      <Mat t={t} />
      {t !== 'vidrio' && <Edges threshold={20} color="#7d88a3" transparent opacity={0.55 * op} />}
    </mesh>
  );
}
/** Cilindro: eje 'y' (vertical) o 'x' (horizontal, a lo ancho). `p` es el centro. */
function Cil({ rad, largo, p, eje = 'y', t = 'metal' }: { rad: number; largo: number; p: V3; eje?: 'x' | 'y' | 'z'; t?: Tono }) {
  const rot: V3 = eje === 'x' ? [0, 0, Math.PI / 2] : eje === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[rad, rad, largo, 20]} />
      <Mat t={t} />
    </mesh>
  );
}

interface Dim { w: number; d: number; h: number }

/** El CAD no indica cuál es el frente de cada máquina: los detalles frontales (ventana, puerta, panel)
 *  se dibujan en las dos caras largas para que se vean desde cualquier ángulo de cámara. */
function Ambos({ children }: { children: ReactNode }) {
  return <>{children}<group scale={[1, 1, -1]}>{children}</group></>;
}

/** Centro de mecanizado vertical cerrado (Haas, SVM): cabina, puerta con ventana, columna del husillo y panel. */
function FresadoraCNC({ w, d, h }: Dim) {
  const hc = h * 0.72;
  return (
    <>
      <Caja s={[w * 0.96, hc, d * 0.92]} p={[0, 0, 0]} />
      <Caja s={[w * 0.9, 0.06, d * 0.86]} p={[0, hc, 0]} t="techo" />
      <Caja s={[w * 0.34, h - hc, d * 0.3]} p={[0, hc, -d * 0.2]} t="techo" />
      <Ambos>
        <Caja s={[w * 0.46, hc * 0.42, 0.03]} p={[-w * 0.1, hc * 0.36, d * 0.47 + 0.01]} t="vidrio" />
        <Caja s={[w * 0.02, hc * 0.62, 0.035]} p={[w * 0.15, hc * 0.22, d * 0.47 + 0.01]} t="oscuro" />
        <Caja s={[w * 0.16, hc * 0.36, 0.1]} p={[w * 0.38, hc * 0.42, d * 0.5]} t="panel" r={[0, -0.35, 0]} />
      </Ambos>
    </>
  );
}

/** Fresadora de rodilla (tipo Bridgeport): base, columna, rodilla, mesa, carnero y cabezal. */
function FresadoraConvencional({ w, d, h }: Dim) {
  return (
    <>
      <Caja s={[w * 0.5, 0.12, d * 0.7]} p={[0, 0, 0]} t="oscuro" />
      <Caja s={[w * 0.34, h * 0.72, d * 0.32]} p={[0, 0.12, -d * 0.16]} t="pintura" />
      <Caja s={[w * 0.36, h * 0.24, d * 0.32]} p={[0, h * 0.14, d * 0.14]} t="pintura" />
      <Caja s={[w * 0.4, 0.08, d * 0.3]} p={[0, h * 0.38, d * 0.16]} t="metal" />
      <Caja s={[w * 0.96, 0.09, d * 0.2]} p={[0, h * 0.46, d * 0.16]} t="metal" />
      <Caja s={[w * 0.22, 0.2, d * 0.62]} p={[0, h * 0.84, 0]} t="pintura" />
      <Caja s={[w * 0.18, h * 0.22, 0.24]} p={[0, h * 0.62, d * 0.24]} t="pintura" />
      <Cil rad={0.08} largo={0.26} p={[0, h * 0.94, d * 0.24]} t="oscuro" />
      <Cil rad={0.035} largo={0.12} p={[0, h * 0.57, d * 0.24]} />
    </>
  );
}

/** Torno CNC de bancada inclinada: cabina con ventana inclinada, transportador de viruta y panel. */
function TornoCNC({ w, d, h }: Dim) {
  const hc = h * 0.86;
  return (
    <>
      <Caja s={[w * 0.78, hc, d * 0.8]} p={[-w * 0.1, 0, 0]} />
      <Caja s={[w * 0.72, 0.06, d * 0.74]} p={[-w * 0.1, hc, 0]} t="techo" />
      <Ambos>
        <Caja s={[w * 0.42, hc * 0.36, 0.03]} p={[-w * 0.16, hc * 0.42, d * 0.41]} t="vidrio" r={[-0.3, 0, 0]} />
        <Caja s={[w * 0.14, hc * 0.34, 0.1]} p={[w * 0.22, hc * 0.4, d * 0.42]} t="panel" />
      </Ambos>
      <Caja s={[w * 0.18, hc * 0.42, d * 0.36]} p={[w * 0.39, 0, -d * 0.1]} t="oscuro" />
      <Caja s={[w * 0.16, 0.1, d * 0.3]} p={[w * 0.4, hc * 0.42, -d * 0.1]} t="metal" r={[0, 0, 0.35]} />
    </>
  );
}

/** Torno paralelo: patas, bancada, cabezal con plato, carro y contrapunto. */
function TornoConvencional({ w, d, h }: Dim) {
  const yb = h * 0.5;
  return (
    <>
      <Caja s={[w * 0.18, yb, d * 0.62]} p={[-w * 0.36, 0, 0]} t="pintura" />
      <Caja s={[w * 0.14, yb, d * 0.62]} p={[w * 0.38, 0, 0]} t="pintura" />
      <Caja s={[w * 0.96, h * 0.1, d * 0.42]} p={[0, yb, -d * 0.05]} t="metal" />
      <Caja s={[w * 0.24, h * 0.34, d * 0.56]} p={[-w * 0.35, yb + h * 0.1, -d * 0.02]} t="pintura" />
      <Cil rad={h * 0.1} largo={0.12} p={[-w * 0.2, yb + h * 0.27, -d * 0.04]} eje="x" />
      <Caja s={[w * 0.1, h * 0.16, d * 0.56]} p={[0, yb + h * 0.1, 0]} t="oscuro" />
      <Caja s={[w * 0.1, h * 0.2, d * 0.28]} p={[w * 0.38, yb + h * 0.1, -d * 0.04]} t="pintura" />
      <Cil rad={0.035} largo={w * 0.3} p={[w * 0.18, yb + h * 0.27, -d * 0.04]} eje="x" />
    </>
  );
}

/** Torno suizo con alimentador de barras: máquina cerrada en un extremo y alimentador largo y bajo. */
function TornoSuizo({ w, d, h }: Dim) {
  const lm = Math.min(w * 0.36, 3);
  const xm = -w / 2 + lm / 2;
  const la = w - lm - 0.1;
  const xa = w / 2 - la / 2;
  return (
    <>
      <Caja s={[lm, h * 0.92, d * 0.86]} p={[xm, 0, 0]} />
      <Caja s={[lm * 0.94, 0.06, d * 0.8]} p={[xm, h * 0.92, 0]} t="techo" />
      <Ambos>
        <Caja s={[lm * 0.5, h * 0.3, 0.03]} p={[xm - lm * 0.08, h * 0.46, d * 0.44]} t="vidrio" />
        <Caja s={[lm * 0.14, h * 0.3, 0.1]} p={[xm + lm * 0.34, h * 0.44, d * 0.45]} t="panel" />
      </Ambos>
      <Caja s={[la, h * 0.26, d * 0.4]} p={[xa, h * 0.36, -d * 0.05]} t="pintura" />
      {[0.15, 0.5, 0.85].map(f => (
        <Caja key={f} s={[0.12, h * 0.36, d * 0.3]} p={[xa - la / 2 + la * f, 0, -d * 0.05]} t="oscuro" />
      ))}
      <Cil rad={0.05} largo={la * 0.95} p={[xa, h * 0.64, -d * 0.05]} eje="x" />
    </>
  );
}

/** Electroerosión por hilo: bancada con tanque de trabajo, columna con brazo superior, bobina y unidad dieléctrica. */
function EdmHilo({ w, d, h }: Dim) {
  return (
    <>
      <Caja s={[w * 0.82, h * 0.34, d * 0.46]} p={[0, 0, d * 0.2]} />
      <Caja s={[w * 0.64, h * 0.14, d * 0.34]} p={[0, h * 0.34, d * 0.22]} t="vidrio" />
      <Caja s={[w * 0.42, h * 0.86, d * 0.2]} p={[0, 0, -d * 0.08]} t="oscuro" />
      <Caja s={[w * 0.18, h * 0.1, d * 0.28]} p={[0, h * 0.68, d * 0.1]} t="oscuro" />
      <Cil rad={0.03} largo={h * 0.22} p={[0, h * 0.57, d * 0.22]} />
      <Cil rad={0.13} largo={0.08} p={[w * 0.23, h * 0.66, -d * 0.08]} eje="x" t="pintura" />
      <Caja s={[w * 0.86, h * 0.62, d * 0.24]} p={[0, 0, -d * 0.36]} />
      <Caja s={[w * 0.2, h * 0.3, 0.06]} p={[w * 0.28, h * 0.26, -d * 0.24]} t="panel" />
    </>
  );
}

/** Cortadora láser de cama plana: mesa, pórtico con cabezal, cabina de vidrio, mesa de intercambio y gabinetes. */
function Laser({ w, d, h }: Dim) {
  const yb = h * 0.28;
  return (
    <>
      <Caja s={[w * 0.86, yb, d * 0.58]} p={[0, 0, d * 0.06]} t="pintura" />
      <Caja s={[w * 0.8, 0.04, d * 0.54]} p={[0, yb, d * 0.06]} t="metal" />
      <Caja s={[w * 0.92, h * 0.1, 0.4]} p={[0, h * 0.42, d * 0.02]} t="pintura" />
      {[-1, 1].map(s => <Caja key={s} s={[0.3, h * 0.2, 0.5]} p={[s * w * 0.44, yb, d * 0.02]} t="pintura" />)}
      <Caja s={[0.3, h * 0.14, 0.3]} p={[w * 0.1, h * 0.32, d * 0.02 + 0.3]} t="oscuro" />
      <Caja s={[w * 0.9, h * 0.32, d * 0.62]} p={[0, yb, d * 0.06]} t="vidrio" />
      <Caja s={[w * 0.8, 0.12, d * 0.18]} p={[0, yb * 0.6, d * 0.43]} t="metal" />
      <Caja s={[w * 0.3, h * 0.55, d * 0.14]} p={[-w * 0.25, 0, -d * 0.38]} />
      <Caja s={[w * 0.22, h * 0.4, d * 0.12]} p={[w * 0.22, 0, -d * 0.38]} t="pintura" />
    </>
  );
}

/** Rectificadora plana: bancada, mesa larga con plato magnético y guardas contra salpicaduras, columna atrás con el
 *  cabezal y la muela (disco con su guarda) sobre la mesa, tanque de refrigerante debajo de la mesa y panel. */
function Rectificadora({ w, d, h }: Dim) {
  const yb = h * 0.46;
  const zm = d * 0.16;                      // eje de la mesa, hacia el frente
  return (
    <>
      <Caja s={[w * 0.6, yb, d * 0.62]} p={[0, 0, d * 0.12]} t="pintura" />
      <Caja s={[w * 0.96, 0.07, d * 0.34]} p={[0, yb, zm]} t="metal" />
      <Caja s={[w * 0.5, 0.05, d * 0.26]} p={[0, yb + 0.07, zm]} t="oscuro" />
      {[-1, 1].map(s => <Caja key={s} s={[w * 0.62, h * 0.09, 0.02]} p={[0, yb + 0.07, zm + s * d * 0.16]} t="vidrio" />)}
      <Caja s={[w * 0.16, h * 0.28, d * 0.3]} p={[w * 0.4, 0, d * 0.1]} t="oscuro" />
      <Caja s={[w * 0.3, h * 0.9, d * 0.3]} p={[0, 0, -d * 0.33]} t="pintura" />
      <Caja s={[w * 0.2, h * 0.15, d * 0.36]} p={[0, h * 0.64, -d * 0.1]} t="pintura" />
      <Cil rad={h * 0.14} largo={d * 0.12} p={[0, h * 0.66, d * 0.13]} eje="z" t="metal" />
      <Cil rad={h * 0.05} largo={0.05} p={[-w * 0.2, yb * 0.62, d * 0.45]} eje="z" t="oscuro" />
      <Caja s={[w * 0.12, h * 0.26, 0.08]} p={[w * 0.22, h * 0.52, -d * 0.12]} t="panel" />
    </>
  );
}

function Horno({ w, d, h }: Dim) {
  return (
    <>
      <Caja s={[w * 0.96, h * 0.86, d * 0.9]} p={[0, 0, 0]} t="oscuro" />
      <Ambos>
        <Caja s={[w * 0.7, h * 0.42, 0.04]} p={[0, h * 0.3, d * 0.45]} t="metal" />
        <Caja s={[w * 0.6, h * 0.1, 0.05]} p={[0, h * 0.74, d * 0.45]} t="panel" />
      </Ambos>
      <Cil rad={Math.min(w, d) * 0.12} largo={h * 0.14} p={[0, h * 0.93, -d * 0.2]} />
    </>
  );
}

/** Plegadora: bastidores laterales en C, viga superior y mesa inferior. */
function Dobladora({ w, d, h }: Dim) {
  return (
    <>
      {[-1, 1].map(s => <Caja key={s} s={[w * 0.08, h, d * 0.9]} p={[s * w * 0.45, 0, 0]} t="pintura" />)}
      <Caja s={[w * 0.84, h * 0.24, d * 0.3]} p={[0, h * 0.72, 0]} t="pintura" />
      <Caja s={[w * 0.82, h * 0.06, d * 0.08]} p={[0, h * 0.62, d * 0.04]} t="metal" />
      <Caja s={[w * 0.84, h * 0.48, d * 0.3]} p={[0, 0, 0]} t="pintura" />
      <Caja s={[w * 0.82, h * 0.06, d * 0.1]} p={[0, h * 0.48, d * 0.04]} t="metal" />
      <Caja s={[w * 0.08, h * 0.24, 0.08]} p={[w * 0.32, h * 0.5, d * 0.42]} t="panel" />
    </>
  );
}

/** Cizalla: carcasas laterales, viga de cuchilla inclinada, mesa frontal con brazos de apoyo. */
function Guillotina({ w, d, h }: Dim) {
  return (
    <>
      {[-1, 1].map(s => <Caja key={s} s={[w * 0.1, h * 0.92, d * 0.5]} p={[s * w * 0.44, 0, -d * 0.12]} t="pintura" />)}
      <Caja s={[w * 0.8, h * 0.2, d * 0.22]} p={[0, h * 0.62, -d * 0.12]} t="pintura" r={[0, 0, -0.04]} />
      <Caja s={[w * 0.8, h * 0.5, d * 0.36]} p={[0, 0, -d * 0.12]} t="oscuro" />
      <Caja s={[w * 0.84, 0.06, d * 0.36]} p={[0, h * 0.5, d * 0.22]} t="metal" />
      {[-0.3, 0.3].map(f => <Caja key={f} s={[0.08, 0.05, d * 0.32]} p={[w * f, h * 0.53, d * 0.22]} t="oscuro" />)}
    </>
  );
}

/** Puesto de soldadura: mesa de trabajo sobre patas, máquina de soldar en carro y cilindro de gas. */
function Soldadora({ w, d, h }: Dim) {
  const xm = w * 0.36;
  return (
    <>
      <Caja s={[w * 0.62, 0.07, d * 0.82]} p={[-w * 0.14, h * 0.78, 0]} t="metal" />
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => (
        <Caja key={`${sx}${sz}`} s={[0.07, h * 0.78, 0.07]} p={[-w * 0.14 + sx * w * 0.28, 0, sz * d * 0.36]} t="oscuro" />
      ))}
      <Caja s={[w * 0.18, h * 0.62, d * 0.46]} p={[xm, 0.06, 0]} t="pintura" />
      <Cil rad={0.11} largo={h * 1.1} p={[xm + w * 0.07, h * 0.55, -d * 0.36]} t="oscuro" />
    </>
  );
}

/** Máquina sin identificar: gabinete con panel de control. */
function Generica({ w, d, h }: Dim) {
  return (
    <>
      <Caja s={[w * 0.94, h * 0.82, d * 0.9]} p={[0, 0, 0]} />
      <Caja s={[w * 0.88, 0.06, d * 0.84]} p={[0, h * 0.82, 0]} t="techo" />
      <Ambos>
        <Caja s={[w * 0.4, h * 0.3, 0.03]} p={[-w * 0.12, h * 0.34, d * 0.45 + 0.01]} t="vidrio" />
        <Caja s={[w * 0.16, h * 0.3, 0.08]} p={[w * 0.3, h * 0.36, d * 0.46]} t="panel" />
      </Ambos>
    </>
  );
}

const MODELOS: Record<FamiliaMaquina, (d: Dim) => ReactNode> = {
  fresadora_cnc: FresadoraCNC, fresadora_convencional: FresadoraConvencional,
  torno_cnc: TornoCNC, torno_convencional: TornoConvencional, torno_suizo: TornoSuizo,
  edm_hilo: EdmHilo, laser: Laser, rectificadora: Rectificadora, horno: Horno, dobladora: Dobladora, guillotina: Guillotina,
  soldadora: Soldadora, generica: Generica,
};

export function ModeloMaquina({ familia, ...dim }: Dim & { familia?: FamiliaMaquina }) {
  const f = familia ?? 'generica';
  const M = MODELOS[f] ?? Generica;
  return <PaletaCtx.Provider value={PALETAS[f] ?? {}}><M {...dim} /></PaletaCtx.Provider>;
}

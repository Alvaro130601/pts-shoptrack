import { useEffect, useRef, useState } from 'react';
import type { EstadoMaquina, Item, Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { NOMBRE_FAMILIA } from '../familias';
import { estadoLargo, etiquetaPaso, fecha, itemCorto, legible, tallerNombre } from '../formato';
import { IcoCerrar } from '../iconos';
import { RutaItem } from '../modulos/RutaItem';

const ESTADO_MAQ = { rojo: 'Atrasada', amarillo: 'En riesgo', verde: 'A tiempo', libre: 'Libre' } as const;
/** Sin semáforo no siempre es libre: puede tener trabajo de SO sin fecha de entrega. */
const estadoMaq = (m: EstadoMaquina) =>
  m.semaforo === 'libre' && (m.en_proceso.length || m.cola.length) ? 'Con trabajo, sin fecha de entrega' : ESTADO_MAQ[m.semaforo];

export function PanelMaquina({ m, centro, items, opInicial, onPaso, onCerrar }: {
  m: EstadoMaquina;
  centro?: string;                       // nombre del proceso al que pertenece
  items: Map<string, Item>;              // para mostrar la ruta del ítem de cada operación
  opInicial?: string;
  onPaso: (o: Operacion) => void;
  onCerrar: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(opInicial ?? m.en_proceso[0]?.id ?? m.cola[0]?.id ?? null);
  const refAbierta = useRef<HTMLDivElement>(null);
  useEffect(() => { if (opInicial) setAbierta(opInicial); }, [opInicial]);
  useEffect(() => { refAbierta.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [abierta]);

  const grupos: [string, string, Operacion[]][] = [
    ['En proceso', '', m.en_proceso],
    ['En cola', 'orden sugerido', m.cola],
    ['Próximas', 'en camino o bloqueadas', m.proximas],
  ];
  const total = m.en_proceso.length + m.cola.length + m.proximas.length;
  return (
    <aside className="panel tarjeta" aria-label={`Máquina ${m.nombre}`}>
      <header>
        <div>
          <div className="sup">{centro ?? 'Sin proceso asignado'} · {NOMBRE_FAMILIA[m.familia ?? 'generica']} · {tallerNombre(m.taller)}</div>
          <h2>{m.nombre}</h2>
          {m.fuera_de_servicio
            ? <span className="estado-maq fuera"><span className="punto" />Fuera de servicio · {m.fuera_de_servicio}</span>
            : <span className={`estado-maq ${m.semaforo}`}><span className="punto" style={{ background: colorSemaforo(m.semaforo) }} />{estadoMaq(m)}</span>}
        </div>
        <button className="icono-btn" onClick={onCerrar} aria-label="Cerrar (Esc)" title="Cerrar (Esc)"><IcoCerrar /></button>
      </header>
      <div className="resumen">
        <div><b>{m.horas_cola}</b><span>h en proceso y cola</span></div>
        <div><b>{m.dias_carga}</b><span>días de carga</span></div>
        <div><b>{m.capacidad_horas_dia}</b><span>h/día cap.</span></div>
      </div>
      <p className="nota-plan">Plan sugerido según la carga de cada máquina del proceso. El supervisor decide.</p>
      <div className="lista">
        {grupos.map(([titulo, sub, ops]) => ops.length > 0 && (
          <section key={titulo}>
            <h3>{titulo} <span>{ops.length}</span>{sub && <small> {sub}</small>}</h3>
            {ops.map(o => {
              const abiertaOp = abierta === o.id;
              const it = items.get(o.item_id);
              return (
                <div key={o.id} ref={abiertaOp ? refAbierta : undefined} className={`op ${abiertaOp ? 'abierta' : ''} ${o.estado}`}>
                  <button className="op-cab" aria-expanded={abiertaOp} onClick={() => setAbierta(abiertaOp ? null : o.id)}>
                    <span className="op-fila">
                      <span className="pos">{o.posicion === 0 ? '▶' : o.posicion ?? '·'}</span>
                      <span className="so">{o.proyecto}</span>
                      <span className="desc">{itemCorto(o)} · {etiquetaPaso(o)}</span>
                      {!!o.ajustes?.length && <span className="tag-ajuste" title={o.maquina_fija ? 'Máquina fijada por el supervisor' : 'Cambio del supervisor'}>{o.maquina_fija ? 'fijada' : 'ajustado'}</span>}
                      {o.semaforo && <span className="pill" style={{ background: colorSemaforo(o.semaforo) }}>{o.semaforo}</span>}
                    </span>
                    <span className="op-meta">
                      <span>{o.horas_pendientes} h</span>
                      <span>{fecha(o.inicio_proyectado)} → {fecha(o.fin_proyectado)}</span>
                      <span>Límite {fecha(o.limite)}</span>
                    </span>
                    {o.estado !== 'en_proceso' && o.estado !== 'en_cola' && <span className="op-espera">{estadoLargo(o)}</span>}
                  </button>
                  {abiertaOp && (
                    <div className="op-detalle">
                      {it && <RutaItem ruta={it.ruta} actual={o.id} onPaso={onPaso} />}
                      <dl>
                        <dt>Cliente</dt><dd>{o.cliente || '—'}</dd>
                        <dt>Ítem</dt><dd>{o.item}{o.cantidad ? ` · ${o.cantidad} unidades` : ''}{it ? ` · ${it.situacion}` : ''}</dd>
                        <dt>Tareas</dt><dd>{o.nombre}</dd>
                        <dt>Horas</dt><dd>{o.horas_pendientes} pendientes de {o.horas_totales} ({o.horas_registradas} registradas)</dd>
                        <dt>Plan</dt><dd>{fecha(o.inicio_proyectado)} → {fecha(o.fin_proyectado)} · límite {fecha(o.limite)}</dd>
                        <dt>Semáforo</dt><dd>{legible(o.motivo)}</dd>
                        <dt>Entrega SO</dt><dd>{fecha(o.fecha_entrega)}</dd>
                      </dl>
                      {o.url_zoho && <a href={o.url_zoho} target="_blank" rel="noreferrer">Abrir en Zoho ↗</a>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {total === 0 && <p className="vacio">{m.centro_id ? 'Sin trabajo asignado en el plan.' : 'Esta máquina no está en ningún proceso de config/centros.json.'}</p>}
      </div>
    </aside>
  );
}

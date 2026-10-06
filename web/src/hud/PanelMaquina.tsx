import { useEffect, useRef, useState } from 'react';
import { bufferDias } from '../../../shared/reglas';
import type { EstadoMaquina, Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { NOMBRE_FAMILIA } from '../familias';
import { fecha, legible, tallerNombre } from '../formato';
import { IcoCerrar } from '../iconos';
import { LineaFases } from './LineaFases';

const ESTADO_MAQ = { rojo: 'Atrasada', amarillo: 'En riesgo', verde: 'A tiempo', libre: 'Libre' } as const;

export function PanelMaquina({ m, opInicial, onCerrar }: { m: EstadoMaquina; opInicial?: string; onCerrar: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(opInicial ?? m.en_proceso[0]?.id ?? m.cola[0]?.id ?? null);
  const refAbierta = useRef<HTMLDivElement>(null);
  useEffect(() => { if (opInicial) setAbierta(opInicial); }, [opInicial]);
  useEffect(() => { refAbierta.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [abierta]);

  const grupos: [string, Operacion[]][] = [['En proceso', m.en_proceso], ['En cola', m.cola], ['Por liberar', m.por_liberar]];
  const total = m.en_proceso.length + m.cola.length + m.por_liberar.length;
  return (
    <aside className="panel tarjeta" aria-label={`Máquina ${m.nombre}`}>
      <header>
        <div>
          <div className="sup">{NOMBRE_FAMILIA[m.familia ?? 'generica']} · {tallerNombre(m.taller)}</div>
          <h2>{m.nombre}</h2>
          <span className={`estado-maq ${m.semaforo}`}><span className="punto" style={{ background: colorSemaforo(m.semaforo) }} />{ESTADO_MAQ[m.semaforo]}</span>
        </div>
        <button className="icono-btn" onClick={onCerrar} aria-label="Cerrar (Esc)" title="Cerrar (Esc)"><IcoCerrar /></button>
      </header>
      <div className="resumen">
        <div><b>{m.horas_cola}</b><span>h en cola</span></div>
        <div><b>{m.dias_carga}</b><span>días de carga</span></div>
        <div><b>{m.capacidad_horas_dia}</b><span>h/día cap.</span></div>
      </div>
      <div className="lista">
        {grupos.map(([titulo, ops]) => ops.length > 0 && (
          <section key={titulo}>
            <h3>{titulo} <span>{ops.length}</span></h3>
            {ops.map(o => {
              const abiertaOp = abierta === o.id;
              return (
                <div key={o.id} ref={abiertaOp ? refAbierta : undefined} className={`op ${abiertaOp ? 'abierta' : ''}`}>
                  <button className="op-cab" aria-expanded={abiertaOp} onClick={() => setAbierta(abiertaOp ? null : o.id)}>
                    <span className="op-fila">
                      <span className="pos">{o.posicion === 0 ? '▶' : o.posicion ?? '·'}</span>
                      <span className="so">{o.so}</span>
                      <span className="desc">{o.descripcion}</span>
                      <span className="pill" style={{ background: colorSemaforo(o.semaforo) }}>{o.semaforo}</span>
                    </span>
                    <span className="op-meta">
                      <span>{o.horas_pendientes} h pend.</span>
                      <span>Límite {fecha(o.fecha_limite_produccion)}</span>
                      <span>Entrega {fecha(o.fecha_entrega)}</span>
                    </span>
                  </button>
                  {abiertaOp && (
                    <div className="op-detalle">
                      <LineaFases fase={o.fase} />
                      <dl>
                        <dt>Cliente</dt><dd>{o.cliente || '—'}</dd>
                        <dt>Fin proyectado</dt><dd>{fecha(o.fin_proyectado)}</dd>
                        <dt>Semáforo</dt><dd>{legible(o.motivo)}</dd>
                        <dt>Buffer</dt><dd>{o.requiere_servicio_externo ? (o.requiere_ensamble ? 'Serv. externo + ensamble' : 'Serv. externo') : 'Estándar'} ({bufferDias(o)} d)</dd>
                        <dt>Horas</dt><dd>{o.horas_pendientes} pendientes de {o.horas_totales}</dd>
                      </dl>
                      {o.url_zoho && <a href={o.url_zoho} target="_blank" rel="noreferrer">Abrir en Zoho ↗</a>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {total === 0 && <p className="vacio">Sin órdenes asignadas.</p>}
      </div>
    </aside>
  );
}

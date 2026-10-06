import { useState } from 'react';
import type { EstadoMaquina, Operacion } from '../../../shared/tipos';
import { colorSemaforo } from '../colores';
import { LineaFases } from './LineaFases';

const fecha = (s?: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) : '—';

export function PanelMaquina({ m, onCerrar }: { m: EstadoMaquina; onCerrar: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(m.en_proceso[0]?.id ?? m.cola[0]?.id ?? null);
  const grupos: [string, Operacion[]][] = [['En proceso', m.en_proceso], ['En cola', m.cola], ['Por liberar', m.por_liberar]];
  return (
    <aside className="panel tarjeta">
      <header>
        <div>
          <div className="sup">{m.proceso ?? 'Proceso sin definir'} · {m.taller?.replace('taller-', 'Taller #') ?? 'Fuera de talleres'}</div>
          <h2>{m.nombre}</h2>
        </div>
        <button className="x" onClick={onCerrar} aria-label="Cerrar">×</button>
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
            {ops.map(o => (
              <div key={o.id} className={`op ${abierta === o.id ? 'abierta' : ''}`} onClick={() => setAbierta(abierta === o.id ? null : o.id)}>
                <div className="op-fila">
                  <span className="pos">{o.posicion === 0 ? '▶' : o.posicion ?? '·'}</span>
                  <span className="so">{o.so}</span>
                  <span className="desc">{o.descripcion}</span>
                  <span className="pill" style={{ background: colorSemaforo(o.semaforo) }}>{o.semaforo}</span>
                </div>
                <div className="op-meta">
                  <span>{o.horas_pendientes} h pend.</span>
                  <span>Límite prod. {fecha(o.fecha_limite_produccion)}</span>
                  <span>Entrega {fecha(o.fecha_entrega)}</span>
                </div>
                {abierta === o.id && (
                  <div className="op-detalle">
                    <LineaFases fase={o.fase} />
                    <dl>
                      <dt>Cliente</dt><dd>{o.cliente || '—'}</dd>
                      <dt>Fin proyectado</dt><dd>{fecha(o.fin_proyectado)}</dd>
                      <dt>Semáforo</dt><dd>{o.motivo}</dd>
                      <dt>Buffer</dt><dd>{o.requiere_servicio_externo ? (o.requiere_ensamble ? 'Serv. externo + ensamble (6 d)' : 'Serv. externo (5 d)') : 'Estándar (2 d)'}</dd>
                    </dl>
                    {o.url_zoho && <a href={o.url_zoho} target="_blank" rel="noreferrer">Abrir en Zoho ↗</a>}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
        {m.en_proceso.length + m.cola.length + m.por_liberar.length === 0 && <p className="vacio">Sin órdenes asignadas.</p>}
      </div>
    </aside>
  );
}

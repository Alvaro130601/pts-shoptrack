import { useEffect, useState } from 'react';
import type { EstadoPlanta } from '../../shared/tipos';
import type { Layout } from './tipos-layout';

export function useDatos(intervaloMs = 60_000) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [estado, setEstado] = useState<EstadoPlanta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch('/api/layout')
    .then(r => { if (!r.ok) throw new Error(`No se pudo cargar el layout (${r.status})`); return r.json(); })
    .then(setLayout).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch('/api/estado')
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then(j => { if (vivo) { setEstado(j); setError(null); } })
      .catch(e => vivo && setError(String(e.message ?? e)));
    cargar();
    const t = setInterval(cargar, intervaloMs);
    return () => { vivo = false; clearInterval(t); };
  }, [intervaloMs]);
  return { layout, estado, error };
}

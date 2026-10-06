import { useCallback, useEffect, useState } from 'react';
import type { EstadoPlanta } from '../../shared/tipos';
import type { Backend } from './backend';
import type { Layout } from './tipos-layout';

/** Layout y estado de la planta. `recargar()` vuelve a pedir el estado al momento (después de un ajuste). */
export function useDatos(backend: Backend) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [estado, setEstado] = useState<EstadoPlanta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    backend.layout().then(setLayout).catch(e => setError(String(e.message ?? e)));
  }, [backend]);
  useEffect(() => {
    let vivo = true;
    const cargar = () => backend.estado()
      .then(e => { if (vivo) { setEstado(e); setError(null); } })
      .catch(e => vivo && setError(String(e.message ?? e)));
    cargar();
    const t = backend.refrescoMs ? setInterval(cargar, backend.refrescoMs) : undefined;
    const dejar = backend.alCambiar(cargar);
    return () => { vivo = false; if (t) clearInterval(t); dejar(); };
  }, [backend, version]);
  return { layout, estado, error, recargar };
}

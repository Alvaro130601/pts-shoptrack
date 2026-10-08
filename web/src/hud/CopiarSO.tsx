import { useEffect, useState } from 'react';

/** Copia el número de SO para buscarlo en Zoho. Si el navegador no deja usar el portapapeles, lo copia con una
 *  selección temporal. */
export function CopiarSO({ so }: { so: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1600);
    return () => clearTimeout(t);
  }, [copiado]);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(so); }
    catch {
      const t = document.createElement('textarea');
      t.value = so; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles: queda seleccionado */ }
      t.remove();
    }
    setCopiado(true);
  };
  return (
    <button type="button" className="boton chico" onClick={copiar} title={`Copiar ${so} para buscarlo en Zoho`}>
      {copiado ? 'Copiado ✓' : 'Copiar SO'}
    </button>
  );
}

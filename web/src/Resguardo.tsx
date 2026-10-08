import { Component, type ReactNode } from 'react';

/** Si una parte de la pantalla falla al dibujarse, muestra el motivo en su lugar y el resto sigue funcionando
 *  (sin esto React desmonta toda la app). El error se avisa con el evento `shoptrack-error` (diagnóstico). */
export class Resguardo extends Component<{ nombre: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.nombre}]`, error);
    window.dispatchEvent(new CustomEvent('shoptrack-error', { detail: `${this.props.nombre}: ${error?.message ?? error}` }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="resguardo tarjeta" role="alert">
        <b>No se pudo mostrar {this.props.nombre}</b>
        <span>{String(this.state.error.message ?? this.state.error).slice(0, 300)}</span>
        <button type="button" className="boton" onClick={() => this.setState({ error: null })}>Reintentar</button>
      </div>
    );
  }
}

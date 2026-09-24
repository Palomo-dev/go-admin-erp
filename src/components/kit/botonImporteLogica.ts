/**
 * Estados del botón con importe (Figma `CobrarButton`: default · sin-caja ·
 * falta · procesando · deshabilitado), sin React.
 */
import type { VarianteBoton } from './botonClases';

export type EstadoBotonImporte = 'listo' | 'sinCaja' | 'falta' | 'procesando' | 'deshabilitado';

export interface VistaBotonImporte {
  variante: VarianteBoton;
  /** `disabled` real: no recibe clics. */
  deshabilitado: boolean;
  /** Spinner y `aria-busy`. */
  ocupado: boolean;
  /** Se muestra el motivo bajo el botón («Falta $ 20.000», «Abre la caja para cobrar»). */
  mostrarMotivo: boolean;
  /** Se muestra el importe dentro del botón. */
  mostrarImporte: boolean;
}

export function vistaBotonImporte(estado: EstadoBotonImporte): VistaBotonImporte {
  switch (estado) {
    case 'sinCaja':
      // Sigue activo: su acción es abrir la caja (POS-PLAN D4).
      return { variante: 'tinte', deshabilitado: false, ocupado: false, mostrarMotivo: false, mostrarImporte: false };
    case 'falta':
      return { variante: 'primario', deshabilitado: true, ocupado: false, mostrarMotivo: true, mostrarImporte: true };
    case 'procesando':
      return { variante: 'primario', deshabilitado: true, ocupado: true, mostrarMotivo: false, mostrarImporte: true };
    case 'deshabilitado':
      return { variante: 'primario', deshabilitado: true, ocupado: false, mostrarMotivo: true, mostrarImporte: true };
    default:
      return { variante: 'primario', deshabilitado: false, ocupado: false, mostrarMotivo: false, mostrarImporte: true };
  }
}

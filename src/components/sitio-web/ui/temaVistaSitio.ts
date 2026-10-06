/**
 * Tema del SITIO del cliente para las vistas previas esquemáticas (encabezado,
 * pie, megamenú, preset). Son datos del borrador V2 (tokens del sitio), no del
 * ERP: solo se aplican con `style` dentro de la vista previa. Puro.
 */
import type { CSSProperties } from 'react';
import type { MuestraEstilo } from './StylePresetCard';

export interface TemaVistaSitio extends MuestraEstilo {
  /** Fondo de la barra superior y de bandas secundarias; por defecto el fondo. */
  fondoSecundario?: string;
  /** Texto atenuado (enlaces, detalles). */
  textoSuave?: string;
  /** Líneas divisorias. */
  linea?: string;
}

/** Tema neutro de respaldo (oscuro, como el preset Noir de los diseños) para cuando aún no hay borrador. */
export const TEMA_VISTA_RESPALDO: TemaVistaSitio = {
  fondo: '#111111',
  fondoSecundario: '#1C1C1C',
  texto: '#FFFFFF',
  textoSuave: '#A3A3A3',
  linea: '#2A2A2A',
  acento: '#C8A97E',
  textoAcento: '#111111',
  fuenteTitulos: "'Inter', sans-serif",
  fuenteTexto: "'Inter', sans-serif",
  radioBoton: 4,
};

export function estilosTema(t: TemaVistaSitio) {
  const base: CSSProperties = { backgroundColor: t.fondo, color: t.texto, fontFamily: t.fuenteTexto ?? t.fuenteTitulos };
  return {
    base,
    secundario: { backgroundColor: t.fondoSecundario ?? t.fondo, color: t.texto } as CSSProperties,
    suave: { color: t.textoSuave ?? t.texto, opacity: t.textoSuave ? 1 : 0.7 } as CSSProperties,
    linea: { borderColor: t.linea ?? t.textoSuave ?? t.texto } as CSSProperties,
    boton: { backgroundColor: t.acento, color: t.textoAcento, borderRadius: t.radioBoton } as CSSProperties,
    logo: { backgroundColor: t.acento, color: t.textoAcento } as CSSProperties,
    titulo: { fontFamily: t.fuenteTitulos } as CSSProperties,
    acento: { color: t.acento } as CSSProperties,
  };
}

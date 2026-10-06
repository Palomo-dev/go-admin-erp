/**
 * Un icono por sección de Configuración, compartido por el índice, la
 * tarjeta y la fila móvil; los estados de los legales reutilizan los iconos del
 * estado de publicación del sitio.
 */
import { AlertTriangle, Hash, Trash2 } from 'lucide-react';
import { SECCIONES_CONFIGURACION } from '@/lib/website/configuracionSitio';
import { ICONO_ESTADO_PUBLICACION } from '../../ui/iconosSitio';
import {
  ICONOS_SECCION_CONFIGURACION,
  ICONO_ACCION_LEGAL,
  ICONO_ESTADO_LEGAL,
  ICONO_PESTANA_CARTA,
  claseColorIconoSeccion,
  tonoIconoSeccion,
} from '../iconosSecciones';

describe('iconosSecciones', () => {
  it('cada sección tiene un icono propio, sin repetir', () => {
    const iconos = SECCIONES_CONFIGURACION.map((s) => ICONOS_SECCION_CONFIGURACION[s]);
    expect(iconos.every(Boolean)).toBe(true);
    expect(new Set(iconos).size).toBe(SECCIONES_CONFIGURACION.length);
  });

  it('coincide con la captura móvil B/12-03: # para el código y papelera para el peligro', () => {
    expect(ICONOS_SECCION_CONFIGURACION.codigo).toBe(Hash);
    expect(ICONOS_SECCION_CONFIGURACION.peligro).toBe(Trash2);
  });

  it('solo la Zona de peligro cambia de color', () => {
    for (const s of SECCIONES_CONFIGURACION) {
      expect(tonoIconoSeccion(s)).toBe(s === 'peligro' ? 'peligro' : 'neutro');
      expect(claseColorIconoSeccion(s)).toBe(s === 'peligro' ? 'text-danger-text' : 'text-fg-secondary');
    }
  });

  it('los legales repiten los iconos del estado de publicación del sitio', () => {
    expect(ICONO_ESTADO_LEGAL.publicado).toBe(ICONO_ESTADO_PUBLICACION.publicado);
    expect(ICONO_ESTADO_LEGAL.borrador).toBe(ICONO_ESTADO_PUBLICACION.borrador);
    expect(ICONO_ESTADO_LEGAL.falta).toBe(AlertTriangle);
    expect(new Set(Object.values(ICONO_ACCION_LEGAL)).size).toBe(3);
  });

  it('las cuatro pestañas del detalle de la carta tienen icono distinto', () => {
    expect(new Set(Object.values(ICONO_PESTANA_CARTA)).size).toBe(4);
  });
});

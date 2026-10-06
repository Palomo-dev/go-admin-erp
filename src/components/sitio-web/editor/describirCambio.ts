/**
 * Texto de cada cambio de la lista «Publicar cambios» (Figma A/05g, D/05-24): icono, título
 * («Inicio · Carta destacada») y detalle («Variante «Pestañas» → «Anclas + barra fija»»).
 * Puro: recibe el traductor del editor.
 */
import { Pencil, Plus, Trash2, Wand2, type LucideIcon } from 'lucide-react';
import type { CambioPublicacion } from '@/lib/website/v2/cambiosPublicacion';
import { nombreDeSeccion, nombreDeVariante } from './iconosSeccion';
import type { TraductorEditor } from './textos';

export interface CambioDescrito {
  clave: string;
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  /** Destino de «Ver»: la página y, si aplica, la sección. */
  ver: { paginaId: string; seccionId?: string } | null;
}

export function describirCambio(c: CambioPublicacion, t: TraductorEditor): CambioDescrito {
  if (c.tipo === 'seccion') {
    const nombre = nombreDeSeccion(c.seccionTipo);
    const titulo = t('publicar.cambio.seccionTitulo', { pagina: c.pagina, seccion: nombre });
    const icono = c.accion === 'nueva' ? Plus : c.accion === 'quitada' ? Trash2 : Pencil;
    if (c.accion !== 'editada' || !c.detalle) {
      return {
        clave: `s-${c.seccionId}`,
        icono,
        titulo,
        detalle: t(`publicar.cambio.seccion.${c.accion}`),
        ver: c.accion === 'quitada' ? { paginaId: c.paginaId } : { paginaId: c.paginaId, seccionId: c.seccionId },
      };
    }
    const partes: string[] = [];
    if (c.detalle.variante) {
      partes.push(
        t('publicar.cambio.variante', {
          antes: c.detalle.variante.antes ? nombreDeVariante(c.seccionTipo, c.detalle.variante.antes) : '—',
          despues: c.detalle.variante.despues ? nombreDeVariante(c.seccionTipo, c.detalle.variante.despues) : '—',
        }),
      );
    }
    if (c.detalle.contenido) partes.push(t('publicar.cambio.contenido'));
    if (c.detalle.estilo) partes.push(t('publicar.cambio.estilo'));
    if (c.detalle.visibilidad) partes.push(t('publicar.cambio.visibilidad'));
    return {
      clave: `s-${c.seccionId}`,
      icono,
      titulo,
      detalle: partes.join(' · ') || t('publicar.cambio.seccion.editada'),
      ver: { paginaId: c.paginaId, seccionId: c.seccionId },
    };
  }
  if (c.tipo === 'pagina') {
    return {
      clave: `p-${c.paginaId}`,
      icono: c.accion === 'nueva' ? Plus : c.accion === 'quitada' ? Trash2 : Pencil,
      titulo: c.pagina,
      detalle: t(`publicar.cambio.pagina.${c.accion}`),
      ver: c.accion === 'quitada' ? null : { paginaId: c.paginaId },
    };
  }
  if (c.tipo === 'tema') {
    const partes = c.colores.map((x) =>
      t('publicar.cambio.color', { rol: t(`publicar.rol.${x.rol}`), antes: x.antes ?? '—', despues: x.despues ?? '—' }),
    );
    if (c.tipografia) partes.push(t('publicar.cambio.tipografia'));
    if (c.otros && partes.length === 0) partes.push(t('publicar.cambio.temaOtros'));
    return { clave: 'tema', icono: Wand2, titulo: t('publicar.cambio.temaTitulo'), detalle: partes.join(' · '), ver: null };
  }
  return { clave: c.tipo, icono: Pencil, titulo: t(`publicar.area.${c.tipo}`), detalle: t(`publicar.areaDetalle.${c.tipo}`), ver: null };
}

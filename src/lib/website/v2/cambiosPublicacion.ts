/**
 * Lista de cambios del diálogo «Publicar cambios» (Figma A/05g y D/05-24): qué cambió desde la
 * última publicación, a nivel de SECCIÓN («Inicio · Carta destacada · Variante «Pestañas» →
 * «Anclas + barra fija»»), de página y de cada área global («Estilo del sitio · Acento #C8A97E →
 * #8C6A3F»). Complementa `diferenciasDocumento` (que cuenta por área para el Resumen): aquí va el
 * detalle que la persona revisa antes de publicar. Puro.
 */
import type { DocumentoSitio, SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { igualesEstructural } from './mapeoAjustes';
import { valorCampo } from './valorCampo';

export type AccionCambio = 'nueva' | 'editada' | 'quitada';

/** Qué cambió dentro de una sección editada. */
export interface DetalleSeccion {
  variante?: { antes: string | null; despues: string | null };
  contenido: boolean;
  estilo: boolean;
  visibilidad: boolean;
}

export interface CambioColor {
  rol: 'primario' | 'secundario' | 'acento' | 'fondo' | 'texto';
  antes: string | null;
  despues: string | null;
}

export type CambioPublicacion =
  | { tipo: 'seccion'; accion: AccionCambio; paginaId: string; pagina: string; seccionId: string; seccionTipo: string; detalle?: DetalleSeccion }
  | { tipo: 'pagina'; accion: AccionCambio; paginaId: string; pagina: string }
  | { tipo: 'tema'; colores: CambioColor[]; tipografia: boolean; otros: boolean }
  | { tipo: 'identidad' | 'seo' | 'contenido' | 'menus' | 'shell' };

function detalleSeccion(antes: SeccionSitio, despues: SeccionSitio): DetalleSeccion {
  const disenoSinEstilo = (s: SeccionSitio) => {
    const { estilo: _e, ...resto } = (s.diseno ?? {}) as Record<string, unknown>;
    void _e;
    return resto;
  };
  const d: DetalleSeccion = {
    contenido: !igualesEstructural(antes.contenido, despues.contenido) || !igualesEstructural(disenoSinEstilo(antes), disenoSinEstilo(despues)),
    estilo: !igualesEstructural((antes.diseno as Record<string, unknown> | undefined)?.estilo, (despues.diseno as Record<string, unknown> | undefined)?.estilo),
    visibilidad: !igualesEstructural(antes.visibilidad, despues.visibilidad),
  };
  if ((antes.variante ?? null) !== (despues.variante ?? null)) d.variante = { antes: antes.variante ?? null, despues: despues.variante ?? null };
  return d;
}

const ROLES: CambioColor['rol'][] = ['primario', 'secundario', 'acento', 'fondo', 'texto'];

/**
 * Cambios del borrador frente a lo publicado. `publicado = null` (nunca se publicó): cada página
 * cuenta como nueva y no se detallan secciones.
 */
export function listarCambios(borrador: DocumentoSitio | null, publicado: DocumentoSitio | null): CambioPublicacion[] {
  if (!borrador) return [];
  const cambios: CambioPublicacion[] = [];
  const antes = new Map((publicado?.paginas ?? []).map((p) => [p.id, p]));
  const ids = new Set<string>();

  for (const p of borrador.paginas) {
    ids.add(p.id);
    const previa = antes.get(p.id);
    if (!previa) {
      cambios.push({ tipo: 'pagina', accion: 'nueva', paginaId: p.id, pagina: p.titulo });
      continue;
    }
    const { secciones: sA, ...metaA } = previa;
    const { secciones: sD, ...metaD } = p;
    if (!igualesEstructural(metaA, metaD)) cambios.push({ tipo: 'pagina', accion: 'editada', paginaId: p.id, pagina: p.titulo });
    const secAntes = new Map(sA.map((s) => [s.id, s]));
    const secIds = new Set<string>();
    for (const s of sD) {
      secIds.add(s.id);
      const a = secAntes.get(s.id);
      const base = { tipo: 'seccion' as const, paginaId: p.id, pagina: p.titulo, seccionId: s.id, seccionTipo: s.tipo };
      if (!a) cambios.push({ ...base, accion: 'nueva' });
      else if (!igualesEstructural(a, s)) cambios.push({ ...base, accion: 'editada', detalle: detalleSeccion(a, s) });
    }
    for (const s of sA) {
      if (!secIds.has(s.id)) {
        cambios.push({ tipo: 'seccion', accion: 'quitada', paginaId: p.id, pagina: p.titulo, seccionId: s.id, seccionTipo: s.tipo });
      }
    }
    // Solo cambió el orden: se cuenta como edición de la página.
    const ordenA = sA.map((s) => s.id).filter((id) => secIds.has(id));
    const ordenD = sD.map((s) => s.id).filter((id) => secAntes.has(id));
    if (!igualesEstructural(ordenA, ordenD) && !cambios.some((c) => c.tipo === 'pagina' && c.paginaId === p.id)) {
      cambios.push({ tipo: 'pagina', accion: 'editada', paginaId: p.id, pagina: p.titulo });
    }
  }
  for (const [id, p] of Array.from(antes.entries())) {
    if (!ids.has(id)) cambios.push({ tipo: 'pagina', accion: 'quitada', paginaId: id, pagina: p.titulo });
  }

  if (publicado && !igualesEstructural(publicado.tema, borrador.tema)) {
    const colores: CambioColor[] = [];
    for (const rol of ROLES) {
      const a = valorCampo(publicado.tema.colores[rol]);
      const d = valorCampo(borrador.tema.colores[rol]);
      if (a !== d) colores.push({ rol, antes: a, despues: d });
    }
    const tipografia = !igualesEstructural(publicado.tema.tipografia, borrador.tema.tipografia);
    const { colores: _c1, tipografia: _t1, ...restoA } = publicado.tema;
    const { colores: _c2, tipografia: _t2, ...restoD } = borrador.tema;
    void _c1;
    void _t1;
    void _c2;
    void _t2;
    cambios.push({ tipo: 'tema', colores, tipografia, otros: !igualesEstructural(restoA, restoD) });
  } else if (!publicado) {
    cambios.push({ tipo: 'tema', colores: [], tipografia: false, otros: true });
  }
  for (const area of ['identidad', 'shell', 'menus', 'seo', 'contenido'] as const) {
    if (publicado && !igualesEstructural(publicado[area], borrador[area])) cambios.push({ tipo: area });
  }
  return cambios;
}

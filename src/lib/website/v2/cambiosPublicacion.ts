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

// ─── Revisión con los datos de la sede (Figma «16 Sitio web» 2264:51434, lámina 16) ──────────

/**
 * Qué del borrador pide revisar datos del ERP antes de publicar. Solo las variantes que dependen
 * de ellos: el plano de mesas (`reservation` · `floor_plan`), la carta por sede (`menu_full` ·
 * `dotted`) y el carrusel editorial (`hero` · `carousel_editorial`, fotos para celular).
 * `sedes` vacío = las de la organización (la sección no eligió).
 */
export interface UsosConDatos {
  plano: { sedes: number[] } | null;
  carta: { sedes: number[] } | null;
  /** Fotos del carrusel editorial: cuántas y cuántas traen versión para celular. */
  portada: { fotos: number; conCelular: number } | null;
}

const idsSedes = (valor: unknown): number[] =>
  Array.isArray(valor) ? valor.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];

/** Sedes de dos secciones: si alguna no eligió (vacío = todas), todas. */
function unirSedes(previo: { sedes: number[] } | null, nuevas: number[]): { sedes: number[] } {
  if (previo && previo.sedes.length === 0) return previo;
  if (nuevas.length === 0) return { sedes: [] };
  return { sedes: [...new Set([...(previo?.sedes ?? []), ...nuevas])] };
}

/** Lee del documento qué secciones visibles necesitan la revisión (puro; lo usa el servidor). */
export function usosConDatos(documento: DocumentoSitio | null): UsosConDatos {
  const usos: UsosConDatos = { plano: null, carta: null, portada: null };
  for (const pagina of documento?.paginas ?? []) {
    for (const s of pagina.secciones) {
      const vis = s.visibilidad as { movil?: boolean; escritorio?: boolean } | undefined;
      if (vis && vis.movil === false && vis.escritorio === false) continue;
      const c = (s.contenido ?? {}) as Record<string, unknown>;
      if (s.tipo === 'reservation' && s.variante === 'floor_plan') {
        usos.plano = unirSedes(usos.plano, idsSedes(c.branch_ids));
      } else if (s.tipo === 'menu_full' && s.variante === 'dotted') {
        usos.carta = unirSedes(usos.carta, idsSedes(c.branch_ids));
      } else if (s.tipo === 'hero' && s.variante === 'carousel_editorial') {
        const fotos = Array.isArray(c.slides) ? (c.slides as Record<string, unknown>[]).filter((f) => f && (f.image_url || f.image_url_mobile)) : [];
        const previo = usos.portada ?? { fotos: 0, conCelular: 0 };
        usos.portada = { fotos: previo.fotos + fotos.length, conCelular: previo.conCelular + fotos.filter((f) => typeof f.image_url_mobile === 'string' && f.image_url_mobile).length };
      }
    }
  }
  return usos;
}

/** Lo que el servidor leyó de una sede (organización ya validada). */
export interface DatosSedePublicacion {
  id: number;
  nombre: string;
  /** Mesas de la sede: zona y si tienen posición en el plano. */
  mesas: readonly { zona: string | null; conPosicion: boolean }[];
  /** Elementos fijos del plano que se ven en la web. */
  elementos: number;
  /** `restaurant_booking_settings.is_enabled` de la sede (o el de la organización); `null` = sin configuración. */
  reservasActivas: boolean | null;
  /** Precios propios vigentes de la sede (`product_branch_prices`). */
  preciosPropios: number;
}

export type ClaveAvisoPublicacion =
  | 'planoListo'
  | 'zonaSinPlano'
  | 'sinMesas'
  | 'reservasActivas'
  | 'reservasApagadas'
  | 'preciosSede'
  | 'precioGeneral'
  | 'fotosPortada';

/** Una línea de la revisión. Ninguna bloquea: cada sección tiene su respaldo. */
export interface AvisoPublicacion {
  clave: ClaveAvisoPublicacion;
  /** `ok` = ✓; `aviso` = ! (no bloquea). */
  estado: 'ok' | 'aviso';
  valores: Record<string, string | number>;
}

/**
 * Revisión antes de publicar (lámina 16): plano por zona, reservas activas, precios por sede y
 * fotos de la portada. Puro: recibe lo que leyó el servidor, nunca valores del navegador.
 */
export function avisosPublicacion(usos: UsosConDatos, sedes: readonly DatosSedePublicacion[]): AvisoPublicacion[] {
  const avisos: AvisoPublicacion[] = [];
  const nombre = (s: DatosSedePublicacion) => s.nombre;
  const delPlano = usos.plano ? sedes.filter((s) => usos.plano!.sedes.length === 0 || usos.plano!.sedes.includes(s.id)) : [];
  for (const s of delPlano) {
    if (s.mesas.length === 0) {
      avisos.push({ clave: 'sinMesas', estado: 'aviso', valores: { sede: nombre(s) } });
      continue;
    }
    const zonas = new Map<string, { total: number; conPosicion: number }>();
    for (const m of s.mesas) {
      const z = (m.zona ?? '').trim();
      const actual = zonas.get(z) ?? { total: 0, conPosicion: 0 };
      actual.total += 1;
      if (m.conPosicion) actual.conPosicion += 1;
      zonas.set(z, actual);
    }
    for (const [zona, n] of [...zonas.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
      const valores = { sede: nombre(s), zona: zona || '—', mesas: n.total, sinPosicion: n.total - n.conPosicion, elementos: s.elementos };
      avisos.push(n.conPosicion === n.total ? { clave: 'planoListo', estado: 'ok', valores } : { clave: 'zonaSinPlano', estado: 'aviso', valores });
    }
    avisos.push(
      s.reservasActivas === false
        ? { clave: 'reservasApagadas', estado: 'aviso', valores: { sede: nombre(s) } }
        : { clave: 'reservasActivas', estado: 'ok', valores: { sede: nombre(s) } },
    );
  }
  const deLaCarta = usos.carta ? sedes.filter((s) => usos.carta!.sedes.length === 0 || usos.carta!.sedes.includes(s.id)) : [];
  for (const s of deLaCarta) {
    avisos.push(
      s.preciosPropios > 0
        ? { clave: 'preciosSede', estado: 'ok', valores: { sede: nombre(s), n: s.preciosPropios } }
        : { clave: 'precioGeneral', estado: 'aviso', valores: { sede: nombre(s) } },
    );
  }
  if (usos.portada && usos.portada.fotos > 0) {
    const { fotos, conCelular } = usos.portada;
    avisos.push({ clave: 'fotosPortada', estado: conCelular === fotos ? 'ok' : 'aviso', valores: { n: conCelular, total: fotos } });
  }
  return avisos;
}

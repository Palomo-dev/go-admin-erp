/**
 * Combinación a tres vías del borrador V2 (Figma A/05i «Hay una versión más nueva» → «Combinar:
 * aplicar mis cambios sobre la versión nueva · Solo chocan si tocamos la misma sección»).
 *
 * - `base`: el documento del que partió mi borrador (la revisión `base_revision_id`).
 * - `servidor`: lo que hay ahora (otra persona guardó o publicó).
 * - `local`: mi borrador con mis cambios.
 *
 * La unidad de combinación es la que la persona reconoce: cada sección (por id), los datos de
 * cada página, el orden de secciones, y cada área global (tema, identidad, SEO, contenido del
 * negocio, menús, encabezado y pie). Si solo uno de los dos cambió una unidad, gana ese cambio;
 * si los dos la cambiaron distinto, es un CHOQUE y se resuelve con `elecciones` («la mía» o «la
 * suya»; por defecto, la mía). Nunca se pierde una sección añadida por cualquiera de los dos.
 * Puro: sin React, Next ni Supabase.
 */
import { serializarDeterminista, type DocumentoSitio, type PaginaSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';

export type Eleccion = 'mia' | 'suya';

export type Choque =
  | { clave: string; tipo: 'area'; area: AreaGlobal }
  | { clave: string; tipo: 'pagina'; paginaId: string; titulo: string }
  | { clave: string; tipo: 'seccion'; paginaId: string; titulo: string; seccionId: string; seccionTipo: string }
  | { clave: string; tipo: 'orden'; paginaId: string; titulo: string };

export interface ResultadoCombinacion {
  documento: DocumentoSitio;
  choques: Choque[];
}

export const AREAS_GLOBALES = ['tema', 'identidad', 'seo', 'contenido', 'menus', 'shell'] as const;
export type AreaGlobal = (typeof AREAS_GLOBALES)[number];

const igual = (a: unknown, b: unknown) => serializarDeterminista(a ?? null) === serializarDeterminista(b ?? null);
const copia = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Valor combinado de una unidad. `undefined` = la unidad no existe (borrada o nunca creada).
 * Devuelve `choque: true` si los dos la cambiaron distinto.
 */
function combinarUnidad<T>(b: T | undefined, s: T | undefined, l: T | undefined, eleccion: Eleccion | undefined): { valor: T | undefined; choque: boolean } {
  if (igual(l, b)) return { valor: s, choque: false };
  if (igual(s, b)) return { valor: l, choque: false };
  if (igual(s, l)) return { valor: s, choque: false };
  return { valor: (eleccion ?? 'mia') === 'mia' ? l : s, choque: true };
}

function metaPagina(p: PaginaSitio | undefined): Omit<PaginaSitio, 'secciones'> | undefined {
  if (!p) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secciones, ...resto } = p;
  return resto;
}

/** Orden final: si solo uno reordenó, su orden; si no, el del servidor con lo nuevo de mi lado insertado tras su anterior. */
function combinarOrden(b: string[], s: string[], l: string[], eleccion: Eleccion | undefined): { orden: string[]; choque: boolean } {
  const comunes = (x: string[], con: Set<string>) => x.filter((id) => con.has(id));
  const enTodos = new Set(b.filter((id) => s.includes(id) && l.includes(id)));
  const ob = comunes(b, enTodos);
  const os = comunes(s, enTodos);
  const ol = comunes(l, enTodos);
  let baseOrden: string[];
  let choque = false;
  if (igual(ol, ob)) baseOrden = s;
  else if (igual(os, ob)) baseOrden = l;
  else if (igual(os, ol)) baseOrden = s;
  else {
    choque = true;
    baseOrden = (eleccion ?? 'mia') === 'mia' ? l : s;
  }
  // Inserta lo que solo está en el otro lado, detrás de su vecino anterior.
  const orden = [...baseOrden];
  const otro = baseOrden === s ? l : s;
  otro.forEach((id, i) => {
    if (orden.includes(id)) return;
    const anterior = i > 0 ? otro[i - 1] : null;
    const pos = anterior ? orden.indexOf(anterior) : -1;
    orden.splice(pos >= 0 ? pos + 1 : orden.length, 0, id);
  });
  return { orden, choque };
}

function combinarPagina(
  b: PaginaSitio | undefined,
  s: PaginaSitio,
  l: PaginaSitio,
  elecciones: Record<string, Eleccion>,
  choques: Choque[],
): PaginaSitio {
  const titulo = l.titulo || s.titulo;
  const claveMeta = `pagina:${l.id}`;
  const meta = combinarUnidad(metaPagina(b), metaPagina(s), metaPagina(l), elecciones[claveMeta]);
  if (meta.choque) choques.push({ clave: claveMeta, tipo: 'pagina', paginaId: l.id, titulo });

  const mapa = (p: PaginaSitio | undefined) => new Map((p?.secciones ?? []).map((x) => [x.id, x]));
  const mb = mapa(b);
  const ms = mapa(s);
  const ml = mapa(l);
  const ids = new Set<string>([...Array.from(ms.keys()), ...Array.from(ml.keys())]);
  const secciones = new Map<string, SeccionSitio>();
  ids.forEach((id) => {
    const clave = `seccion:${l.id}/${id}`;
    const r = combinarUnidad(mb.get(id), ms.get(id), ml.get(id), elecciones[clave]);
    if (r.choque) {
      const ref = ml.get(id) ?? ms.get(id) ?? mb.get(id);
      choques.push({ clave, tipo: 'seccion', paginaId: l.id, titulo, seccionId: id, seccionTipo: ref?.tipo ?? '' });
    }
    if (r.valor) secciones.set(id, copia(r.valor));
  });

  const claveOrden = `orden:${l.id}`;
  const orden = combinarOrden(
    (b?.secciones ?? []).map((x) => x.id),
    s.secciones.map((x) => x.id),
    l.secciones.map((x) => x.id),
    elecciones[claveOrden],
  );
  if (orden.choque) choques.push({ clave: claveOrden, tipo: 'orden', paginaId: l.id, titulo });
  const ordenadas = orden.orden.filter((id) => secciones.has(id)).map((id) => secciones.get(id) as SeccionSitio);
  secciones.forEach((sec, id) => {
    if (!orden.orden.includes(id)) ordenadas.push(sec);
  });
  return { ...(copia(meta.valor ?? metaPagina(s)) as Omit<PaginaSitio, 'secciones'>), secciones: ordenadas };
}

/**
 * Combina mi borrador sobre la versión del servidor. Sin `base` (el borrador nunca partió de una
 * revisión publicada) no hay forma de saber quién cambió qué: la UI no ofrece «Combinar».
 */
export function combinarDocumentos(
  base: DocumentoSitio,
  servidor: DocumentoSitio,
  local: DocumentoSitio,
  elecciones: Record<string, Eleccion> = {},
): ResultadoCombinacion {
  const choques: Choque[] = [];
  const resultado = copia(servidor);

  for (const area of AREAS_GLOBALES) {
    const clave = `area:${area}`;
    const r = combinarUnidad(base[area], servidor[area], local[area], elecciones[clave]);
    if (r.choque) choques.push({ clave, tipo: 'area', area });
    (resultado as Record<string, unknown>)[area] = copia(r.valor ?? servidor[area]);
  }

  const pb = new Map(base.paginas.map((p) => [p.id, p]));
  const ps = new Map(servidor.paginas.map((p) => [p.id, p]));
  const pl = new Map(local.paginas.map((p) => [p.id, p]));
  const paginas: PaginaSitio[] = [];
  const ordenIds = [...servidor.paginas.map((p) => p.id), ...local.paginas.map((p) => p.id).filter((id) => !ps.has(id))];

  for (const id of ordenIds) {
    const b = pb.get(id);
    const s = ps.get(id);
    const l = pl.get(id);
    if (s && l) {
      paginas.push(combinarPagina(b, s, l, elecciones, choques));
      continue;
    }
    // La página falta en un lado: se borró (si existía en la base) o se creó en el otro.
    const clave = `pagina:${id}`;
    const r = combinarUnidad(b, s, l, elecciones[clave]);
    if (r.choque) {
      const ref = (l ?? s ?? b) as PaginaSitio;
      choques.push({ clave, tipo: 'pagina', paginaId: id, titulo: ref.titulo });
    }
    if (r.valor) paginas.push(copia(r.valor));
  }
  resultado.paginas = paginas;
  return { documento: resultado, choques };
}

/** `true` si mi borrador y el del servidor tocaron algo en común (hay que preguntar). */
export function hayChoques(r: ResultadoCombinacion): boolean {
  return r.choques.length > 0;
}

/**
 * Contrato mínimo del documento de sitio V2 (etapa 1 del website builder V2).
 *
 * Fuentes que lo gobiernan:
 * - docs/website-builder-v2/FASE-01-CONTRATO-Y-COMPATIBILIDAD.md (documento lógico, límites,
 *   herencia `{mode}` y conservación de tipos desconocidos).
 * - docs/website-builder-v2/ADR-002-DECISIONES-Y-SECUENCIA.md: D1 (borrador y revisión guardan
 *   este documento en jsonb con `schemaVersion`), D3 (menús dentro del documento), D4 (adopción
 *   explícita por sitio: el documento no decide si el sitio sirve V2) y D6 (herencia por campo).
 * - docs/website-builder-v2/D12-CLASIFICACION-COLUMNAS.md: qué columnas de `website_settings`
 *   tienen destino en este documento y cuáles se quedan fuera (operación, integraciones).
 *
 * Código puro: sin React, Next.js ni cliente de Supabase, para poder moverlo tal cual al paquete
 * del contrato (ADR-002 D2, enmendado por la revisión 2026-09-29 A4). Nada de precios, impuestos,
 * stock, envío ni scripts de terceros: eso es operación y no forma parte de la presentación
 * (ADR-001 punto 6).
 */
import { z } from 'zod';

// ─── Versión y límites ──────────────────────────────────────────────────────────────────────

/** Versión del esquema que escribe este código. Se persiste en `schema_version` (D1). */
export const VERSION_ESQUEMA_DOCUMENTO = 1 as const;

/** Límites del documento (F01-01). La migración D1 repite el de tamaño como CHECK. */
export const LIMITES_DOCUMENTO = {
  bytesMaximos: 2 * 1024 * 1024,
  paginasMaximas: 200,
  seccionesPorPagina: 60,
  menusMaximos: 20,
  itemsPorMenu: 200,
  profundidadMenu: 3,
  longitudTextoCorto: 200,
  longitudUrl: 2048,
  longitudSlug: 120,
} as const;

// ─── Herencia por campo (D6) ────────────────────────────────────────────────────────────────

/**
 * Override de un campo en un sitio de sede respecto del sitio principal.
 * - `inherit`: usa el valor efectivo del sitio principal.
 * - `value`: valor propio de la sede.
 * - `clear`: la sede vacía el campo a propósito (no hereda, no muestra nada).
 * La ausencia del campo equivale a `inherit` (FASE-01 §Documento lógico).
 */
export type CampoHeredable<T> =
  | { mode: 'inherit' }
  | { mode: 'value'; value: T }
  | { mode: 'clear' };

export type OrigenCampo = 'principal' | 'propio' | 'vacio';

export interface CampoResuelto<T> {
  valor: T | null;
  origen: OrigenCampo;
}

export function heredar<T>(): CampoHeredable<T> {
  return { mode: 'inherit' };
}

export function valorPropio<T>(value: T): CampoHeredable<T> {
  return { mode: 'value', value };
}

export function vaciar<T>(): CampoHeredable<T> {
  return { mode: 'clear' };
}

/**
 * Resuelve el valor efectivo de un campo de sede.
 *
 * @param principal valor ya resuelto del sitio principal (`null`/`undefined` = sin valor).
 * @param sede override de la sede; `undefined` significa que la sede no lo declaró → hereda.
 * @returns el valor efectivo, `null` cuando no hay ninguno o la sede lo vació.
 */
export function resolverCampo<T>(
  principal: T | null | undefined,
  sede: CampoHeredable<T> | undefined,
): T | null {
  return resolverCampoConOrigen(principal, sede).valor;
}

/** Igual que {@link resolverCampo} pero indica de dónde sale el valor (para el inspector). */
export function resolverCampoConOrigen<T>(
  principal: T | null | undefined,
  sede: CampoHeredable<T> | undefined,
): CampoResuelto<T> {
  if (sede === undefined || sede.mode === 'inherit') {
    return { valor: principal ?? null, origen: 'principal' };
  }
  if (sede.mode === 'clear') {
    return { valor: null, origen: 'vacio' };
  }
  return { valor: sede.value, origen: 'propio' };
}

/**
 * Resuelve un grupo de campos (por ejemplo, los colores del tema) campo a campo.
 * Las claves que la sede no declara heredan; nunca se hace un merge superficial de objetos
 * (el defecto de `theme-merge.ts`, que ADR-002 D7 retira para sitios V2).
 */
export function resolverGrupo<K extends string, T>(
  principal: Partial<Record<K, T | null>>,
  sede: Partial<Record<K, CampoHeredable<T>>> | undefined,
): Record<K, T | null> {
  const claves = new Set<K>([
    ...(Object.keys(principal) as K[]),
    ...(Object.keys(sede ?? {}) as K[]),
  ]);
  const resultado = {} as Record<K, T | null>;
  claves.forEach((clave) => {
    resultado[clave] = resolverCampo<T>(principal[clave], sede?.[clave]);
  });
  return resultado;
}

/**
 * Adaptador de lectura de valores legacy de una fila de sede (`theme-merge`): allí `null`
 * significaba «heredar». Se conserva esa interpretación para no reescribir datos viejos
 * (FASE-01 §Documento lógico). No usar para el sitio principal: al adoptar V2 sus valores
 * actuales quedan explícitos (D6).
 */
export function campoDesdeLegacy<T>(valor: T | null | undefined): CampoHeredable<T> {
  return valor === null || valor === undefined ? heredar<T>() : valorPropio(valor);
}

/** Valor explícito para el sitio principal al importar legacy (D6: se conservan como propios). */
export function campoExplicito<T>(valor: T | null | undefined): CampoHeredable<T> {
  return valor === null || valor === undefined ? vaciar<T>() : valorPropio(valor);
}

// ─── Esquemas zod ───────────────────────────────────────────────────────────────────────────

function esquemaCampo<T extends z.ZodTypeAny>(valor: T) {
  return z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('inherit') }).strict(),
    z.object({ mode: z.literal('value'), value: valor }).strict(),
    z.object({ mode: z.literal('clear') }).strict(),
  ]);
}

const textoCorto = z.string().max(LIMITES_DOCUMENTO.longitudTextoCorto);
const textoLargo = z.string().max(5000);
const url = z.string().max(LIMITES_DOCUMENTO.longitudUrl);
const color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'color_hex_invalido');
const idEstable = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'id_invalido');
const slug = z
  .string()
  .max(LIMITES_DOCUMENTO.longitudSlug)
  .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/, 'slug_invalido');

/** Identidad pública del sitio. La identidad legal/fiscal no vive aquí (FASE-04). */
export const esquemaIdentidad = z
  .object({
    nombre: esquemaCampo(textoCorto).optional(),
    logoUrl: esquemaCampo(url).optional(),
    logoOscuroUrl: esquemaCampo(url).optional(),
    faviconUrl: esquemaCampo(url).optional(),
    alturaLogo: esquemaCampo(z.number().int().min(16).max(200)).optional(),
  })
  .strict();

/** Tokens de tema (D12 grupo «tema»). */
export const esquemaTema = z
  .object({
    plantillaBase: esquemaCampo(textoCorto).optional(),
    modo: esquemaCampo(z.enum(['light', 'dark'])).optional(),
    colores: z
      .object({
        primario: esquemaCampo(color).optional(),
        secundario: esquemaCampo(color).optional(),
        acento: esquemaCampo(color).optional(),
        fondo: esquemaCampo(color).optional(),
        texto: esquemaCampo(color).optional(),
      })
      .strict()
      .default({}),
    tipografia: z
      .object({
        titulos: esquemaCampo(textoCorto).optional(),
        cuerpo: esquemaCampo(textoCorto).optional(),
      })
      .strict()
      .default({}),
    /*
     * Tokens de estilo de Diseño (Figma A/06a, A/06i; 2026-10-06). Opcionales y aditivos:
     * `preset` (id del estilo del catálogo), `radio` (px), `estiloBoton` y `movimiento`.
     * La copia del contrato en goadmin-websites debe aceptarlos ANTES de que el ERP los
     * escriba (su lector valida en modo estricto): el ERP solo los escribe con
     * NEXT_PUBLIC_WEBSITE_TOKENS_ESTILO=1 (`src/lib/website/v2/tokensEstilo.ts`).
     */
    preset: esquemaCampo(z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'preset_invalido')).optional(),
    radio: esquemaCampo(z.union([z.literal(0), z.literal(4), z.literal(12), z.literal(24)])).optional(),
    estiloBoton: esquemaCampo(z.enum(['solido', 'contorno', 'pastilla', 'sombra_dura'])).optional(),
    movimiento: esquemaCampo(z.enum(['ninguno', 'bajo', 'medio', 'alto'])).optional(),
  })
  .strict();

/** SEO del sitio (D12 grupo «SEO»). Las verificaciones de buscadores son por dominio. */
export const esquemaSeo = z
  .object({
    titulo: esquemaCampo(textoCorto).optional(),
    descripcion: esquemaCampo(z.string().max(500)).optional(),
    palabrasClave: esquemaCampo(z.array(textoCorto).max(30)).optional(),
    imagenOgUrl: esquemaCampo(url).optional(),
  })
  .strict();

/** Contacto y horarios públicos del sitio (D12 grupo «contenido/negocio»). */
export const esquemaContenidoNegocio = z
  .object({
    redesSociales: esquemaCampo(z.record(z.string().max(40), url)).optional(),
    horarios: esquemaCampo(z.record(z.string().max(40), z.unknown())).optional(),
    textoPie: esquemaCampo(textoLargo).optional(),
  })
  .strict();

// Menús (D3): viven dentro del documento, con ids estables e ítems tipados.
interface ItemMenuBase {
  id: string;
  etiqueta: string;
  hijos?: ItemMenu[];
}
export type ItemMenu = ItemMenuBase &
  (
    | { tipo: 'page'; paginaId: string }
    | { tipo: 'entity'; entidad: 'category' | 'product' | 'space'; entidadId: string }
    | { tipo: 'custom'; url: string; nuevaPestana?: boolean }
    | { tipo: 'anchor'; ancla: string; paginaId?: string }
    | { tipo: 'site'; sitioRef: string; ruta?: string }
  );

const esquemaItemMenu: z.ZodType<ItemMenu> = z.lazy(() => {
  const base = {
    id: idEstable,
    etiqueta: textoCorto.min(1),
    hijos: z.array(esquemaItemMenu).max(50).optional(),
  };
  return z.discriminatedUnion('tipo', [
    z.object({ ...base, tipo: z.literal('page'), paginaId: idEstable }).strict(),
    z
      .object({
        ...base,
        tipo: z.literal('entity'),
        entidad: z.enum(['category', 'product', 'space']),
        entidadId: z.string().min(1).max(64),
      })
      .strict(),
    z
      .object({ ...base, tipo: z.literal('custom'), url, nuevaPestana: z.boolean().optional() })
      .strict(),
    z
      .object({ ...base, tipo: z.literal('anchor'), ancla: idEstable, paginaId: idEstable.optional() })
      .strict(),
    z
      .object({ ...base, tipo: z.literal('site'), sitioRef: z.string().min(1).max(64), ruta: z.string().max(500).optional() })
      .strict(),
  ]);
});

export const esquemaMenu = z
  .object({
    id: idEstable,
    nombre: textoCorto.min(1),
    items: z.array(esquemaItemMenu).max(LIMITES_DOCUMENTO.itemsPorMenu),
  })
  .strict();

/** Shell: header y footer referencian menús por id (D3). `opciones` se acota en F05. */
export const esquemaShell = z
  .object({
    header: z
      .object({
        composicion: textoCorto.min(1),
        menuPrincipalId: idEstable.nullable(),
        menuMegaId: idEstable.nullable().optional(),
        opciones: z.record(z.string().max(64), z.unknown()).default({}),
      })
      .strict(),
    footer: z
      .object({
        composicion: textoCorto.min(1),
        menuIds: z.array(idEstable).max(10).default([]),
        opciones: z.record(z.string().max(64), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();

/** Fuente de datos declarada (revisión 2026-09-29, A2/D13). Sin SQL ni claves. */
export const esquemaFuenteDatos = z
  .object({
    tipo: z.enum(['offers', 'best_sellers', 'category', 'collection', 'manual']),
    limite: z.number().int().min(1).max(48),
    orden: z.enum(['relevancia', 'recientes', 'precio_asc', 'precio_desc', 'ventas']).optional(),
    filtros: z.record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  })
  .strict();

/**
 * Sección: `tipo` y `variante` son texto libre a propósito. Un tipo desconocido o más nuevo se
 * conserva con sus datos y se diagnostica aparte; nunca se borra al guardar (F01-03).
 */
export const esquemaSeccion = z
  .object({
    id: idEstable,
    tipo: z.string().min(1).max(64),
    variante: z.string().max(64).nullable(),
    version: z.number().int().min(1),
    contenido: z.record(z.string(), z.unknown()),
    diseno: z.record(z.string(), z.unknown()).default({}),
    /*
     * `tableta` (opcional, 2026-10-06, estilo por sección «Mostrar en»): solo se escribe cuando
     * difiere de `escritorio`; ausente = sigue a `escritorio`. La copia del contrato en
     * goadmin-websites debe aceptarla antes de que un borrador la lleve.
     */
    visibilidad: z
      .object({ movil: z.boolean(), escritorio: z.boolean(), tableta: z.boolean().optional() })
      .strict()
      .default({ movil: true, escritorio: true }),
    fuente: esquemaFuenteDatos.optional(),
  })
  .strict();

export const esquemaPagina = z
  .object({
    id: idEstable,
    slug,
    tipo: z.string().min(1).max(64),
    titulo: textoCorto,
    publicada: z.boolean(),
    seo: esquemaSeo.optional(),
    secciones: z.array(esquemaSeccion).max(LIMITES_DOCUMENTO.seccionesPorPagina),
  })
  .strict();

export const esquemaDocumentoSitio = z
  .object({
    schemaVersion: z.literal(VERSION_ESQUEMA_DOCUMENTO),
    identidad: esquemaIdentidad.default({}),
    tema: esquemaTema,
    seo: esquemaSeo.default({}),
    contenido: esquemaContenidoNegocio.default({}),
    shell: esquemaShell,
    menus: z.array(esquemaMenu).max(LIMITES_DOCUMENTO.menusMaximos),
    paginas: z.array(esquemaPagina).max(LIMITES_DOCUMENTO.paginasMaximas),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const repetido = (valores: string[], ruta: (string | number)[], codigo: string) => {
      const vistos = new Set<string>();
      valores.forEach((valor, i) => {
        if (vistos.has(valor)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...ruta, i], message: codigo });
        vistos.add(valor);
      });
    };
    repetido(doc.paginas.map((p) => p.id), ['paginas'], 'pagina_id_repetido');
    repetido(doc.paginas.map((p) => p.slug), ['paginas'], 'slug_repetido');
    repetido(doc.menus.map((m) => m.id), ['menus'], 'menu_id_repetido');
    repetido(
      doc.paginas.flatMap((p) => p.secciones.map((s) => s.id)),
      ['paginas'],
      'seccion_id_repetido',
    );

    const menus = new Set(doc.menus.map((m) => m.id));
    const paginas = new Set(doc.paginas.map((p) => p.id));
    const referenciaMenu = (id: string | null | undefined, ruta: (string | number)[]) => {
      if (id && !menus.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ruta, message: 'menu_inexistente' });
    };
    referenciaMenu(doc.shell.header.menuPrincipalId, ['shell', 'header', 'menuPrincipalId']);
    referenciaMenu(doc.shell.header.menuMegaId, ['shell', 'header', 'menuMegaId']);
    doc.shell.footer.menuIds.forEach((id, i) => referenciaMenu(id, ['shell', 'footer', 'menuIds', i]));

    const revisarItems = (items: ItemMenu[], ruta: (string | number)[], nivel: number) => {
      items.forEach((item, i) => {
        if (nivel > LIMITES_DOCUMENTO.profundidadMenu) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...ruta, i], message: 'menu_demasiado_profundo' });
          return;
        }
        if (item.tipo === 'page' && !paginas.has(item.paginaId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...ruta, i, 'paginaId'], message: 'pagina_inexistente' });
        }
        if (item.hijos) revisarItems(item.hijos, [...ruta, i, 'hijos'], nivel + 1);
      });
    };
    doc.menus.forEach((menu, i) => revisarItems(menu.items, ['menus', i, 'items'], 1));
  });

export type DocumentoSitio = z.infer<typeof esquemaDocumentoSitio>;
export type DocumentoSitioEntrada = z.input<typeof esquemaDocumentoSitio>;
export type SeccionSitio = z.infer<typeof esquemaSeccion>;
export type PaginaSitio = z.infer<typeof esquemaPagina>;
export type MenuSitio = z.infer<typeof esquemaMenu>;
export type FuenteDatos = z.infer<typeof esquemaFuenteDatos>;

// ─── Validación y serialización ─────────────────────────────────────────────────────────────

export type ResultadoValidacion =
  | { ok: true; documento: DocumentoSitio }
  | { ok: false; errores: { ruta: string; codigo: string }[] };

/** Bytes UTF-8 de la serialización, que es lo que limita el CHECK de la migración D1. */
export function bytesDocumento(documento: unknown): number {
  return new TextEncoder().encode(JSON.stringify(documento)).length;
}

/** Valida un documento recibido (borrador o publicación). No lanza: devuelve errores con ruta. */
export function validarDocumentoSitio(entrada: unknown): ResultadoValidacion {
  if (bytesDocumento(entrada) > LIMITES_DOCUMENTO.bytesMaximos) {
    return { ok: false, errores: [{ ruta: '', codigo: 'documento_demasiado_grande' }] };
  }
  const resultado = esquemaDocumentoSitio.safeParse(entrada);
  if (resultado.success) return { ok: true, documento: resultado.data };
  return {
    ok: false,
    errores: resultado.error.issues.map((issue) => ({ ruta: issue.path.join('.'), codigo: issue.message })),
  };
}

/**
 * Serialización determinista (claves ordenadas, sin espacios): dos documentos equivalentes
 * producen el mismo texto, útil para ETag, idempotencia y comparación de revisiones (F01-01).
 */
export function serializarDeterminista(valor: unknown): string {
  return JSON.stringify(ordenarClaves(valor));
}

function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor !== null && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    return Object.keys(objeto)
      .sort()
      .reduce<Record<string, unknown>>((acumulado, clave) => {
        if (objeto[clave] !== undefined) acumulado[clave] = ordenarClaves(objeto[clave]);
        return acumulado;
      }, {});
  }
  return valor;
}

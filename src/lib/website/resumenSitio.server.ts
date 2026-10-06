/**
 * Lectura del Resumen del sitio web (Figma A/02a-02i) en el servidor: UNA
 * llamada que reúne sitio V2, dirección real, lista de lanzamiento, KPIs de 7
 * días, alertas y cambios recientes. Las reglas viven en `resumenSitio.ts`
 * (puro); aquí solo se lee.
 *
 * Todo con el cliente de la SESIÓN (`ctx.supabase`, RLS) y la organización del
 * contexto, nunca de la petición. Se reutilizan:
 * - `siteDocumentService` (sitios, revisiones con autor),
 * - `hostSitio` (dominio principal verificado o subdominio),
 * - `rangoDelPeriodo` + `tiendaWeb` (`fn_inicio_tienda_web`, la misma fuente
 *   que la tarjeta «Tienda web» del inicio y que Analítica),
 * - `seccionesVisiblesServidor` (enlaces solo a páginas que la persona ve),
 * - `permisosSitio` (`fn_website_tiene_permiso`, el criterio de la RLS).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { listarRevisiones, listarSitios } from '@/lib/services/website/siteDocumentService';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { diferenciasDocumento } from '@/lib/website/v2/diferenciasDocumento';
import type { DominioDelSitio } from '@/lib/website/hostSitio';
import { rangoDelPeriodo, tiendaWeb, ErrorInicio, type TiendaWeb } from '@/lib/dashboard/inicio.server';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';
import { giroDesdeTipo, leerOnboarding, type GiroSitio } from './onboardingSitio';
import {
  armarCambios,
  calcularAlertas,
  calcularConversion,
  calcularLanzamiento,
  cambiosDesdeEventos,
  decidirEstado,
  direccionSitio,
  tienePasarela,
  type DominioAlerta,
  type EventoCambio,
  type KpisSitio,
  type ResumenSitioRespuesta,
} from './resumenSitio';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

const PAGINA_RESERVAS = '/app/pos/reservas-mesas';


interface FilaDominio extends DominioDelSitio, DominioAlerta {
  id: string;
}

async function documentoDe(ctx: Ctx, tabla: 'website_site_drafts' | 'website_site_revisions', columna: string, id: string) {
  const { data, error } = await ctx.supabase
    .from(tabla)
    .select(tabla === 'website_site_drafts' ? 'document, version, updated_at, updated_by' : 'document')
    .eq(columna, id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const fila = data as unknown as { document: unknown; version?: number; updated_at?: string; updated_by?: string | null };
  const v = validarDocumentoSitio(fila.document);
  return { documento: v.ok ? v.documento : null, version: fila.version ?? null, actualizadoEn: fila.updated_at ?? null, autorId: fila.updated_by ?? null };
}

async function nombrePerfil(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await ctx.supabase.from('profiles').select('first_name, last_name').eq('id', id).maybeSingle();
  const p = data as { first_name: string | null; last_name: string | null } | null;
  const nombre = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  return nombre || null;
}

/** Códigos de «la tabla no existe» (Postgres y PostgREST): la migración del registro aún no se aplica. */
const SIN_TABLA = new Set(['42P01', 'PGRST205']);

/**
 * Registro de cambios (`website_site_change_events`, migración pendiente
 * 20261007120000). Sin la tabla devuelve `null` y el Resumen usa revisiones y
 * la última edición del borrador.
 */
async function leerEventos(ctx: Ctx, sitioId: string): Promise<EventoCambio[] | null> {
  const { data, error } = await ctx.supabase
    .from('website_site_change_events')
    .select('id, tipo, resumen, actor, updated_at')
    .eq('organization_id', ctx.organizationId)
    .eq('site_state_id', sitioId)
    .order('updated_at', { ascending: false })
    .limit(4);
  if (error) {
    if (SIN_TABLA.has((error as { code?: string }).code ?? '')) return null;
    throw error;
  }
  const filas = (data ?? []) as { id: string; tipo: EventoCambio['tipo']; resumen: unknown; actor: string | null; updated_at: string }[];
  const autores = new Map<string, string | null>();
  await Promise.all(
    Array.from(new Set(filas.map((f) => f.actor).filter((a): a is string => !!a))).map(async (id) => autores.set(id, await nombrePerfil(ctx, id))),
  );
  return filas.map((f) => ({ id: f.id, tipo: f.tipo, resumen: f.resumen, creadoEn: f.updated_at, autor: f.actor ? autores.get(f.actor) ?? null : null }));
}

async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw error;
  return count ?? 0;
}

// KPIs: caché de 60 s por organización y usuario, como /api/inicio/tienda-web
// (las visitas son la tabla más grande; «la tienda puede tumbar la base»).
const TTL_KPIS_MS = 60_000;
const MAX_KPIS = 500;
const cacheKpis = new Map<string, { hasta: number; valor: { kpis: KpisSitio; activa: boolean | null } }>();

async function leerKpis(ctx: Ctx, giro: GiroSitio): Promise<{ kpis: KpisSitio; activa: boolean | null }> {
  const clave = `${ctx.organizationId}|${ctx.userId}|${giro}`;
  const guardado = cacheKpis.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  const valor = await leerKpisSinCache(ctx, giro);
  if (cacheKpis.size >= MAX_KPIS) cacheKpis.clear();
  cacheKpis.set(clave, { hasta: Date.now() + TTL_KPIS_MS, valor });
  return valor;
}

async function leerKpisSinCache(ctx: Ctx, giro: GiroSitio): Promise<{ kpis: KpisSitio; activa: boolean | null }> {
  const vacios: KpisSitio = {
    disponible: 'sin_publicar',
    visitas: null,
    visitasAnterior: null,
    pedidos: null,
    reservas: null,
    conversion: null,
    hrefPedidos: null,
    hrefReservas: null,
    hrefAnalitica: null,
  };
  let tienda: TiendaWeb;
  let rango: Awaited<ReturnType<typeof rangoDelPeriodo>>;
  try {
    rango = await rangoDelPeriodo(ctx, { periodo: '7d', horas: null, fechas: null });
    tienda = await tiendaWeb(ctx, rango, null);
  } catch (error) {
    if (error instanceof ErrorInicio && error.status === 403) return { kpis: { ...vacios, disponible: 'sin_acceso' }, activa: null };
    throw error;
  }
  if (!tienda.activa || !tienda.actual) {
    return { kpis: { ...vacios, hrefPedidos: tienda.hrefPedidos, hrefAnalitica: tienda.hrefAnalitica }, activa: false };
  }

  let reservas: number | null = null;
  let hrefReservas: string | null = null;
  if (giro === 'restaurante') {
    const [n, secciones] = await Promise.all([
      contar(
        ctx.supabase
          .from('restaurant_reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)
          .eq('source', 'web')
          .gte('created_at', rango.inicio)
          .lt('created_at', rango.fin),
      ),
      seccionesVisiblesServidor(ctx).catch(() => []),
    ]);
    reservas = n;
    hrefReservas = secciones.some((s) => s.modulos.some((m) => m.paginas.some((p) => p.href === PAGINA_RESERVAS))) ? PAGINA_RESERVAS : null;
  }
  const visitas = tienda.actual.visitantes;
  return {
    activa: true,
    kpis: {
      disponible: 'si',
      visitas,
      visitasAnterior: tienda.anterior?.visitantes ?? null,
      pedidos: tienda.actual.pedidos,
      reservas,
      conversion: calcularConversion(tienda.actual.pedidos, reservas, visitas),
      hrefPedidos: tienda.hrefPedidos,
      hrefReservas,
      hrefAnalitica: tienda.hrefAnalitica,
    },
  };
}

export async function leerResumenSitio(ctx: Ctx, ahora: Date = new Date()): Promise<ResumenSitioRespuesta> {
  const org = ctx.organizationId;
  const db = ctx.supabase;

  const [orgRes, dominiosRes, estadoRes, ajustesRes, sedeRes, pagosRes, sitios, permisos] = await Promise.all([
    db.from('organizations').select('name, logo_url, type_id, subdomain, phone').eq('id', org).maybeSingle(),
    db
      .from('organization_domains')
      .select('id, host, domain_type, status, is_primary, is_active, vercel_state, metadata')
      .eq('organization_id', org),
    db
      .from('website_site_states')
      .select('id, published_revision_id, primary_domain_id, onboarding')
      .eq('organization_id', org)
      .is('branch_id', null)
      .maybeSingle(),
    db
      .from('website_settings')
      .select('template_id, primary_color, is_published, published_at, social_links')
      .eq('organization_id', org)
      .is('branch_id', null)
      .maybeSingle(),
    db.from('branches').select('name, phone').eq('organization_id', org).eq('is_main', true).limit(1).maybeSingle(),
    db.from('organization_payment_methods').select('integration_connection_id, show_on_website, is_active').eq('organization_id', org),
    listarSitios(db, org),
    permisosSitio(ctx),
  ]);
  for (const r of [orgRes, dominiosRes, estadoRes, ajustesRes, sedeRes, pagosRes]) if (r.error) throw r.error;

  const organizacion = orgRes.data as { name: string; logo_url: string | null; type_id: number | null; subdomain: string | null; phone: string | null } | null;
  const dominios = (dominiosRes.data ?? []) as unknown as FilaDominio[];
  const estado = estadoRes.data as { id: string; published_revision_id: string | null; primary_domain_id: string | null; onboarding: unknown } | null;
  const ajustes = ajustesRes.data as {
    template_id: string | null;
    primary_color: string | null;
    is_published: boolean | null;
    published_at: string | null;
    social_links: Record<string, unknown> | null;
  } | null;
  const sede = sedeRes.data as { name: string; phone: string | null } | null;
  const pagos = (pagosRes.data ?? []) as { integration_connection_id: string | null; show_on_website: boolean | null; is_active: boolean | null }[];
  const onboarding = leerOnboarding(estado?.onboarding);
  const giro = onboarding.giro ?? giroDesdeTipo(organizacion?.type_id);
  const principal = sitios.find((s) => s.branchId === null) ?? null;

  // Dirección: una sola regla (servidor) para el Resumen y el asistente.
  const subdominio = organizacion?.subdomain || null;
  const direccion = direccionSitio(dominios, subdominio, estado?.primary_domain_id);
  const { host, hostEsPropio } = direccion;

  // Borrador, revisión publicada y diferencias.
  const [borrador, publicado, revisiones, eventos] = await Promise.all([
    principal?.versionBorrador ? documentoDe(ctx, 'website_site_drafts', 'site_state_id', principal.id) : Promise.resolve(null),
    principal?.revisionPublicadaId ? documentoDe(ctx, 'website_site_revisions', 'id', principal.revisionPublicadaId) : Promise.resolve(null),
    principal ? listarRevisiones(db, org, principal.id, 4) : Promise.resolve([]),
    principal ? leerEventos(ctx, principal.id) : Promise.resolve(null),
  ]);
  const doc: DocumentoSitio | null = borrador?.documento ?? null;
  const diferencias = principal?.cambiosSinPublicar ? diferenciasDocumento(doc, publicado?.documento ?? null) : { cantidad: 0, areas: [] };
  const autorBorrador = diferencias.cantidad > 0 ? await nombrePerfil(ctx, borrador?.autorId ?? null) : null;

  // Página de inicio para «Abrir editor»: la del documento V2 (slug home) o la legacy.
  let paginaInicioId = doc?.paginas.find((p) => p.slug === 'home')?.id ?? null;
  if (!paginaInicioId) {
    const { data } = await db
      .from('website_pages')
      .select('id')
      .eq('organization_id', org)
      .is('branch_id', null)
      .eq('slug', 'home')
      .limit(1)
      .maybeSingle();
    paginaInicioId = (data as { id: string } | null)?.id ?? null;
  }

  const { kpis, activa } = await leerKpis(ctx, giro);
  const estadoPagina = decidirEstado({
    revisionPublicada: !!principal?.revisionPublicadaId,
    onboardingCompletado: onboarding.completado === true,
    sitioConTrafico: activa,
  });
  const primeraVez = estadoPagina === 'primera_vez';

  // Inventario de la carta o del catálogo (solo restaurante y tienda).
  let inventario: { productos: number; categorias: number } | null = null;
  if (giro === 'restaurante' || giro === 'tienda') {
    const [productos, categorias] = await Promise.all([
      contar(db.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'active')),
      contar(db.from('categories').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true)),
    ]);
    inventario = { productos, categorias };
  }

  const pasarela = tienePasarela(pagos);
  const plantillaDoc = valorCampo(doc?.tema.plantillaBase);
  const plantillaId = plantillaDoc ?? onboarding.pasos?.plantilla ?? (primeraVez ? null : ajustes?.template_id ?? null);
  const estiloElegido = !!onboarding.pasos?.estilo || !!valorCampo(doc?.tema.colores.primario) || (!primeraVez && !!ajustes?.primary_color);
  const logo = !!valorCampo(doc?.identidad.logoUrl) || !!organizacion?.logo_url;
  const whatsapp = typeof ajustes?.social_links?.whatsapp === 'string' && ajustes.social_links.whatsapp.trim() !== '';
  const propio = hostEsPropio ? host : null;
  const legacyPublicado = ajustes?.is_published === true;
  const publicadoSitio = !!principal?.revisionPublicadaId || legacyPublicado;
  const opcionDominio = onboarding.pasos?.dominio ?? (primeraVez || !subdominio ? null : 'gratis');

  const ultima = revisiones[0];
  const ultimaPublicacion = ultima
    ? { en: ultima.publicadaEn, autor: ultima.autor }
    : legacyPublicado && ajustes?.published_at
      ? { en: ajustes.published_at, autor: null }
      : null;

  return {
    estado: estadoPagina,
    giro,
    typeId: organizacion?.type_id ?? null,
    sitio: {
      v2Id: principal?.id ?? null,
      versionBorrador: principal?.versionBorrador ?? null,
      origen: principal ? 'v2' : 'legacy',
      ...direccion,
      nombre: valorCampo(doc?.identidad.nombre) ?? organizacion?.name ?? '',
      plantillaId,
      ultimaPublicacion,
      publicado: publicadoSitio,
      cambiosSinPublicar: diferencias,
      paginaInicioId,
    },
    lanzamiento: calcularLanzamiento({
      giro,
      primeraVez,
      plantillaId,
      estiloElegido,
      datos: {
        logo,
        nombre: !!(valorCampo(doc?.identidad.nombre) ?? organizacion?.name),
        contacto: !!(sede?.phone || organizacion?.phone || whatsapp),
        sedePrincipal: sede?.name ?? null,
        confirmados: onboarding.pasos?.datos === true,
      },
      inventario,
      pasarela,
      dominio: { propio, opcion: opcionDominio },
      publicacion: { publicado: publicadoSitio && !primeraVez, cambios: diferencias.cantidad },
    }),
    kpis,
    alertas: calcularAlertas({
      dominios,
      pasarela,
      venderEnLinea:
        giro === 'restaurante' || giro === 'tienda' || (onboarding.objetivos ?? []).some((o) => o === 'pedidos' || o === 'venta_en_linea'),
      ahora,
    }),
    cambios: eventos && eventos.length > 0 ? cambiosDesdeEventos(eventos) : armarCambios({
      revisiones: revisiones.map((r) => ({ id: r.id, numero: r.numero, nota: r.nota, publicadaEn: r.publicadaEn, autor: r.autor, cambios: null })),
      borrador:
        borrador?.actualizadoEn && diferencias.cantidad > 0
          ? { actualizadoEn: borrador.actualizadoEn, autor: autorBorrador, cambiosSinPublicar: diferencias.cantidad, areas: diferencias.areas }
          : null,
    }),
    permisos,
    onboarding: { pasoActual: onboarding.pasoActual ?? null, iniciado: Object.keys(onboarding).length > 0 },
  };
}

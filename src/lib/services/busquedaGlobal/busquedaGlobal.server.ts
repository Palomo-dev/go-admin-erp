/**
 * Buscador global — lado servidor (`GET /api/busqueda-global`).
 *
 * Antes la paleta consultaba once tablas de negocio desde el navegador con el
 * cliente anónimo + RLS, sin mirar los módulos activos ni el cargo: una
 * organización sin PMS lanzaba igual las consultas de reservas y espacios, y
 * una persona cuyo cargo no ve Finanzas encontraba facturas. Además, varios
 * enlaces estaban rotos (productos y proveedores abrían por `id` una ruta que
 * espera `uuid`; proveedores apuntaba a `/app/proveedores`, que no existe; las
 * categorías no pedían el `uuid` que usa su enlace).
 *
 * Ahora:
 *  1. La organización y el usuario salen de la sesión (`withOrg`).
 *  2. `resolverAccesoBusqueda` calcula las páginas que la persona ve con la
 *     MISMA regla que el menú (`filtrarNavegacion`: módulos activos, páginas
 *     apagadas, acceso del cargo) y sus permisos (`get_user_permission_codes`,
 *     rol + cargo). Nada se decide por el nombre del rol.
 *  3. Solo se consultan los grupos con página visible (`gruposPermitidos`) y
 *     solo se ofrecen las acciones con página visible Y permiso.
 *  4. Todas las consultas van con el cliente de SESIÓN (RLS) y filtran por la
 *     organización de la sesión. El texto nunca se interpola crudo en un
 *     `.or()`: los clientes van por la RPC única `fn_clientes_buscar`, los
 *     productos por `buscar_productos` (la del catálogo del POS y del
 *     asistente) y el resto con `patronCandidato`, que solo deja [a-z0-9_%].
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { isOrgAdminLike, ORG_ADMIN_PERMISSION_CODE } from '@/lib/utils/orgAdmin';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { buscarClientes, type ClienteEncontrado } from '@/lib/services/customers/busquedaClientesService';
import { filtrarNavegacion } from '@/lib/navigation/filtrar';
import type { ResultadoEntidad, TipoEntidad } from '@/lib/busquedaGlobal/definiciones';
import {
  coincideCampos,
  gruposPermitidos,
  LIMITE_POR_GRUPO,
  ordenarGrupos,
  palabrasBusqueda,
  patronCandidato,
  type GrupoPermitido,
} from '@/lib/busquedaGlobal/logica';

type Contexto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export interface AccesoBusqueda {
  /** Hrefs de las páginas del menú que la persona ve. */
  hrefsVisibles: Set<string>;
  permisos: Set<string>;
  esAdmin: boolean;
}

/**
 * Páginas visibles y permisos de la persona en la organización de la sesión.
 * Lanza si no se pueden leer los módulos o los permisos: el buscador falla
 * CERRADO (a diferencia del menú, que falla abierto para no dejar a nadie sin
 * salida, aquí no hay nada que ofrecer si no se sabe qué puede ver).
 */
export async function resolverAccesoBusqueda(ctx: Contexto): Promise<AccesoBusqueda> {
  const db = ctx.supabase;
  const [modulos, paginasOcultas, cargo, permisosRes] = await Promise.all([
    moduleManagementService.getActiveModules(ctx.organizationId, db),
    moduleManagementService.getHiddenModulePages(ctx.organizationId, db),
    jobPositionModuleAccessService.getUserAccess(ctx.userId, ctx.organizationId, db),
    db.rpc('get_user_permission_codes', { p_user_id: ctx.userId, p_organization_id: ctx.organizationId }),
  ]);
  if (permisosRes.error) throw new Error(`get_user_permission_codes: ${permisosRes.error.message}`);

  const permisos = new Set(Array.isArray(permisosRes.data) ? (permisosRes.data as string[]) : []);
  const secciones = filtrarNavegacion({
    modulosActivos: modulos.map((m) => m.code),
    paginasOcultas,
    modulosCargo: cargo.visibleModules,
    paginasCargo: cargo.visiblePages,
    // Las páginas que piden capacidades (bandeja de notificaciones) no
    // respaldan ningún grupo ni acción del buscador.
    capacidades: new Set(),
  });
  const hrefsVisibles = new Set(secciones.flatMap((s) => s.modulos.flatMap((m) => m.paginas.map((p) => p.href))));
  return {
    hrefsVisibles,
    permisos,
    esAdmin: isOrgAdminLike(ctx) || permisos.has(ORG_ADMIN_PERMISSION_CODE),
  };
}

// ─── Consultas por grupo ────────────────────────────────────────────────────

/** Candidatos que se piden a la base antes de filtrar con las reglas exactas. */
const CANDIDATOS = 25;
/** Clientes que se usan para encontrar sus facturas, pedidos, reservas y membresías. */
const CLIENTES_RELACIONADOS = 25;

interface Busqueda {
  db: SupabaseClient;
  org: number;
  texto: string;
  palabras: string[];
  patron: string | null;
  /** Clientes que coinciden (ya ordenados por relevancia). */
  clientes: ClienteEncontrado[];
  pagina: string;
}

type Fila = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** PostgREST devuelve una relación a uno como objeto o como arreglo según el esquema. */
const relacion = (v: unknown): Fila | null => (Array.isArray(v) ? ((v[0] as Fila) ?? null) : v && typeof v === 'object' ? (v as Fila) : null);

function filas(res: { data: unknown; error: { message: string } | null }, etiqueta: string): Fila[] {
  if (res.error) throw new Error(`${etiqueta}: ${res.error.message}`);
  return Array.isArray(res.data) ? (res.data as Fila[]) : [];
}

/** `columna.ilike.<patrón>` para cada columna, listo para `.or()`. */
function orIlike(columnas: string[], patron: string): string {
  return columnas.map((c) => `${c}.ilike.${patron}`).join(',');
}

function idsClientes(b: Busqueda): string[] {
  // Los uuid solo llevan [0-9a-f-]: seguros dentro de `in.(…)`.
  return b.clientes.map((c) => c.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}

type Buscador = (b: Busqueda) => Promise<ResultadoEntidad[]>;

const BUSCADORES: Record<TipoEntidad, Buscador> = {
  async customer(b) {
    return b.clientes.slice(0, LIMITE_POR_GRUPO).map((c) => ({
      id: c.id,
      tipo: 'customer',
      titulo: texto(c.full_name) ?? (texto(`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()) || texto(c.company_name)),
      url: `/app/clientes/${c.id}`,
      detalle: { tipoDocumento: texto(c.doc_type), documento: texto(c.doc_number ?? c.identification_number), email: texto(c.email) },
    }));
  },

  async product(b) {
    const [rpc, porCodigo] = await Promise.all([
      b.db.rpc('buscar_productos', { p_org: b.org, p_tokens: b.palabras, p_limite: LIMITE_POR_GRUPO, p_umbral: 1.5 }),
      // Un código de barras escrito o escaneado: coincidencia exacta.
      /^[0-9A-Za-z-]{4,}$/.test(b.texto)
        ? b.db.from('products').select('id').eq('organization_id', b.org).eq('barcode', b.texto).limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const ranking = filas(rpc, 'buscar_productos');
    const exactos = filas(porCodigo, 'products.barcode');
    const ids = Array.from(new Set([...exactos.map((f) => numero(f.id)), ...ranking.map((f) => numero(f.id))])).filter(
      (id): id is number => id !== null,
    );
    if (ids.length === 0) return [];
    // `buscar_productos` no trae el uuid, que es lo que usa la ruta de detalle.
    const detalle = filas(
      await b.db.from('products').select('id, uuid, name, sku').eq('organization_id', b.org).in('id', ids),
      'products',
    );
    const porId = new Map(detalle.map((f) => [numero(f.id), f]));
    const stockPorId = new Map(ranking.map((f) => [numero(f.id), numero(f.stock)]));
    return ids
      .map((id) => porId.get(id))
      .filter((f): f is Fila => !!f && !!texto(f.uuid))
      .map((f) => ({
        id: String(f.id),
        tipo: 'product' as const,
        titulo: texto(f.name),
        url: `/app/inventario/productos/${f.uuid}`,
        detalle: { sku: texto(f.sku), stock: stockPorId.get(numero(f.id)) ?? null },
      }));
  },

  async branch(b) {
    if (!b.patron) return [];
    const res = await b.db
      .from('branches')
      .select('id, name, address, city')
      .eq('organization_id', b.org)
      .or(orIlike(['name', 'address', 'city', 'branch_code'], b.patron))
      .order('name')
      .limit(CANDIDATOS);
    return filas(res, 'branches')
      .filter((f) => coincideCampos([f.name as string, f.address as string, f.city as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'branch' as const,
        titulo: texto(f.name),
        // Las sucursales no tienen página de detalle: se abre su listado.
        url: b.pagina,
        detalle: { direccion: texto(f.address), ciudad: texto(f.city) },
      }));
  },

  async supplier(b) {
    if (!b.patron) return [];
    const res = await b.db
      .from('suppliers')
      .select('id, uuid, name, trade_name, nit, email, city')
      .eq('organization_id', b.org)
      .or(orIlike(['name', 'trade_name', 'nit', 'email'], b.patron))
      .order('name')
      .limit(CANDIDATOS);
    return filas(res, 'suppliers')
      .filter((f) => texto(f.uuid) && coincideCampos([f.name as string, f.trade_name as string, f.nit as string, f.email as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'supplier' as const,
        titulo: texto(f.name) ?? texto(f.trade_name),
        url: `/app/inventario/proveedores/${f.uuid}`,
        detalle: { nit: texto(f.nit), email: texto(f.email), ciudad: texto(f.city) },
      }));
  },

  async category(b) {
    if (!b.patron) return [];
    const res = await b.db
      .from('categories')
      .select('id, uuid, name')
      .eq('organization_id', b.org)
      .ilike('name', b.patron)
      .order('name')
      .limit(CANDIDATOS);
    return filas(res, 'categories')
      .filter((f) => texto(f.uuid) && coincideCampos([f.name as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'category' as const,
        titulo: texto(f.name),
        url: `/app/inventario/categorias/${f.uuid}`,
        detalle: {},
      }));
  },

  async invoice(b) {
    const ids = idsClientes(b);
    const condiciones = [...(b.patron ? [orIlike(['number', 'einvoice_number'], b.patron)] : []), ...(ids.length ? [`customer_id.in.(${ids.join(',')})`] : [])];
    if (condiciones.length === 0) return [];
    const res = await b.db
      .from('invoice_sales')
      .select('id, number, einvoice_number, total, currency, status, customer_id, customers(full_name)')
      .eq('organization_id', b.org)
      .or(condiciones.join(','))
      .order('created_at', { ascending: false })
      .limit(CANDIDATOS);
    return filas(res, 'invoice_sales')
      .filter((f) => ids.includes(f.customer_id as string) || coincideCampos([f.number as string, f.einvoice_number as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'invoice' as const,
        titulo: texto(f.number),
        url: `/app/finanzas/facturas-venta/${f.id}`,
        detalle: {
          cliente: texto(relacion(f.customers)?.full_name),
          total: numero(f.total),
          moneda: texto(f.currency)?.trim() ?? null,
          estado: texto(f.status),
        },
      }));
  },

  async web_order(b) {
    const ids = idsClientes(b);
    const condiciones = [
      ...(b.patron ? [orIlike(['order_number', 'customer_name', 'customer_email', 'customer_phone'], b.patron)] : []),
      ...(ids.length ? [`customer_id.in.(${ids.join(',')})`] : []),
    ];
    if (condiciones.length === 0) return [];
    const res = await b.db
      .from('web_orders')
      .select('id, order_number, customer_id, customer_name, customer_email, customer_phone, total, status')
      .eq('organization_id', b.org)
      .or(condiciones.join(','))
      .order('created_at', { ascending: false })
      .limit(CANDIDATOS);
    return filas(res, 'web_orders')
      .filter(
        (f) =>
          ids.includes(f.customer_id as string) ||
          coincideCampos([f.order_number as string, f.customer_name as string, f.customer_email as string, f.customer_phone as string], b.palabras),
      )
      .map((f) => ({
        id: String(f.id),
        tipo: 'web_order' as const,
        titulo: texto(f.order_number),
        url: `/app/pos/pedidos-online/${f.id}`,
        detalle: { cliente: texto(f.customer_name), total: numero(f.total), estado: texto(f.status) },
      }));
  },

  async reservation(b) {
    const ids = idsClientes(b);
    if (ids.length === 0) return [];
    const res = await b.db
      .from('reservations')
      .select('id, status, checkin, checkout, customers(full_name), spaces(label)')
      .eq('organization_id', b.org)
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(LIMITE_POR_GRUPO);
    return filas(res, 'reservations').map((f) => ({
      id: String(f.id),
      tipo: 'reservation' as const,
      titulo: texto(relacion(f.customers)?.full_name),
      url: `/app/pms/reservas/${f.id}`,
      detalle: {
        espacio: texto(relacion(f.spaces)?.label),
        desdeFecha: texto(f.checkin),
        hastaFecha: texto(f.checkout),
        estado: texto(f.status),
      },
    }));
  },

  async space(b) {
    if (!b.patron) return [];
    // `spaces` no tiene organization_id: se acota por la sucursal.
    const res = await b.db
      .from('spaces')
      .select('id, label, floor_zone, status, space_types(name), branches!inner(organization_id)')
      .eq('branches.organization_id', b.org)
      .or(orIlike(['label', 'floor_zone'], b.patron))
      .order('label')
      .limit(CANDIDATOS);
    return filas(res, 'spaces')
      .filter((f) => coincideCampos([f.label as string, f.floor_zone as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'space' as const,
        titulo: texto(f.label),
        url: `/app/pms/espacios/${f.id}`,
        detalle: { tipoEspacio: texto(relacion(f.space_types)?.name), zona: texto(f.floor_zone), estado: texto(f.status) },
      }));
  },

  async membership(b) {
    const ids = idsClientes(b);
    if (ids.length === 0) return [];
    const res = await b.db
      .from('memberships')
      .select('id, status, start_date, end_date, customers(full_name), membership_plans(name)')
      .eq('organization_id', b.org)
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(LIMITE_POR_GRUPO);
    return filas(res, 'memberships').map((f) => ({
      id: String(f.id),
      tipo: 'membership' as const,
      titulo: texto(relacion(f.customers)?.full_name),
      url: `/app/membresias/membresias/${f.id}`,
      detalle: {
        plan: texto(relacion(f.membership_plans)?.name),
        desdeInstante: texto(f.start_date),
        hastaInstante: texto(f.end_date),
        estado: texto(f.status),
      },
    }));
  },

  async parking_vehicle(b) {
    if (!b.patron) return [];
    const res = await b.db
      .from('parking_vehicles')
      .select('id, plate, brand, model, color, vehicle_type')
      .eq('organization_id', b.org)
      .or(orIlike(['plate', 'brand', 'model'], b.patron))
      .limit(CANDIDATOS);
    return filas(res, 'parking_vehicles')
      .filter((f) => coincideCampos([f.plate as string, f.brand as string, f.model as string], b.palabras))
      .map((f) => ({
        id: String(f.id),
        tipo: 'parking_vehicle' as const,
        titulo: texto(f.plate),
        // Los vehículos no tienen detalle propio: se abre el parqueadero.
        url: b.pagina,
        detalle: { marca: texto(f.brand), modelo: texto(f.model), color: texto(f.color) },
      }));
  },
};

/** Grupos que dependen de los clientes encontrados. */
const USAN_CLIENTES: ReadonlySet<TipoEntidad> = new Set(['customer', 'invoice', 'web_order', 'reservation', 'membership']);

export interface ResultadoBusquedaEntidades {
  grupos: { tipo: TipoEntidad; items: ResultadoEntidad[] }[];
  fallidos: TipoEntidad[];
}

/**
 * Busca `textoCrudo` en los grupos permitidos. Cada grupo falla por su cuenta:
 * uno caído (tabla sin permiso, timeout) va a `fallidos` y los demás llegan.
 */
export async function buscarEntidades(
  ctx: Pick<Contexto, 'organizationId' | 'supabase'>,
  textoCrudo: string,
  permitidos: readonly GrupoPermitido[],
): Promise<ResultadoBusquedaEntidades> {
  const consulta = textoCrudo.trim();
  const palabras = palabrasBusqueda(consulta);
  if (palabras.length === 0 || permitidos.length === 0) return { grupos: [], fallidos: [] };

  const fallidos: TipoEntidad[] = [];
  let clientes: ClienteEncontrado[] = [];
  if (permitidos.some((g) => USAN_CLIENTES.has(g.tipo))) {
    try {
      clientes = (await buscarClientes(ctx.supabase, { organizationId: ctx.organizationId, texto: consulta, limite: CLIENTES_RELACIONADOS })).filas;
    } catch (err) {
      console.warn('[busquedaGlobal] fn_clientes_buscar falló', { org: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
      if (permitidos.some((g) => g.tipo === 'customer')) fallidos.push('customer');
    }
  }

  const patron = patronCandidato(palabras);
  const resultados = await Promise.all(
    permitidos.map(async (g) => {
      if (g.tipo === 'customer' && fallidos.includes('customer')) return { tipo: g.tipo, items: [] };
      try {
        const items = await BUSCADORES[g.tipo]({
          db: ctx.supabase,
          org: ctx.organizationId,
          texto: consulta,
          palabras,
          patron,
          clientes,
          pagina: g.pagina,
        });
        return { tipo: g.tipo, items };
      } catch (err) {
        console.warn('[busquedaGlobal] grupo falló', { tipo: g.tipo, org: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
        fallidos.push(g.tipo);
        return { tipo: g.tipo, items: [] };
      }
    }),
  );
  return { grupos: ordenarGrupos(resultados), fallidos };
}

export { gruposPermitidos };

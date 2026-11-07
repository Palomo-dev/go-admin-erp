/**
 * Catálogo de Integraciones › Conexiones (diseño 85-00): 30 servicios en 7 grupos.
 *
 * Lo que se conecta sale de la BASE (`integration_providers` + `integration_connectors` +
 * `integration_connections` de la organización); aquí solo vive cómo se presenta cada servicio
 * (grupo, asistente, logo) y qué conector real existe en el código. Reglas de estado honesto:
 *  - un proveedor que la base no tiene, o sin conector, o sin conector real en el código →
 *    «En construcción» con su motivo; nunca «Disponible»;
 *  - «Conectado» solo con una conexión `connected` sin errores; con errores o pausada → «Revisar»;
 *  - los servicios que presta GO Admin con su propia cuenta → «Servicio de GO Admin» con enlace;
 *  - un proveedor activo de la base que no está en esta lista aparece igual (grupo por su
 *    categoría), para que nada de la base quede escondido.
 * Puro: sin Supabase ni React.
 */
import type { ProveedorLlaves } from './definicionesLlaves';

export type GrupoCatalogo = 'cobros' | 'hospedaje' | 'domicilios' | 'publicidad' | 'mensajeria' | 'envios' | 'go_admin';
export type EstadoCatalogo = 'conectado' | 'disponible' | 'revisar' | 'en_construccion' | 'servicio_go_admin';
export type TipoAsistente = 'llaves' | 'ota' | 'ical' | 'domicilios' | 'oauth' | 'logistica' | 'enlace' | 'avanzado';
export type MotivoConstruccion =
  | 'sin_proveedor_en_base'
  | 'sin_conector'
  | 'cuenta_socio'
  | 'app_oauth_sin_configurar'
  | 'adaptador_en_construccion'
  | 'sin_conector_en_codigo';

export const GRUPOS: readonly GrupoCatalogo[] = ['cobros', 'hospedaje', 'domicilios', 'publicidad', 'mensajeria', 'envios', 'go_admin'];

export interface DefinicionServicio {
  /** Id estable: clave i18n y logo. */
  id: string;
  grupo: GrupoCatalogo;
  /** `integration_providers.code`, o null si no es un proveedor de la base (GO Admin, chat). */
  proveedor: string | null;
  /** `integration_connectors.code` cuyas conexiones cuentan como de este servicio. */
  conectores: readonly string[];
  asistente: TipoAsistente;
  /** Proveedor del asistente de llaves. */
  llaves?: ProveedorLlaves;
  /** Ruta de la app (servicios de GO Admin, canales que tienen su propio dueño). */
  enlace?: string;
  /** Hay conector real con el proveedor en este repositorio. */
  conectorReal: boolean;
  /** Si no hay conector real, por qué. */
  motivo?: MotivoConstruccion;
  /** Para OAuth: qué app del servidor hace falta. */
  oauth?: 'meta' | 'tiktok' | 'google_ads';
}

export const SERVICIOS: readonly DefinicionServicio[] = [
  // Cobros con tu propia cuenta (6)
  { id: 'wompi', grupo: 'cobros', proveedor: 'wompi', conectores: ['wompi_co'], asistente: 'llaves', llaves: 'wompi', conectorReal: true },
  { id: 'mercadopago', grupo: 'cobros', proveedor: 'mercadopago', conectores: ['mp_checkout'], asistente: 'llaves', llaves: 'mercadopago', conectorReal: true },
  { id: 'payu', grupo: 'cobros', proveedor: 'payu', conectores: ['payu_co'], asistente: 'llaves', llaves: 'payu', conectorReal: true },
  // Bold necesita datáfonos por sucursal: sigue en el formulario avanzado, que ya los guarda.
  { id: 'bold', grupo: 'cobros', proveedor: 'bold', conectores: ['bold_link', 'bold_pos'], asistente: 'avanzado', enlace: '/app/integraciones/conexiones/nueva?provider=bold', conectorReal: true },
  { id: 'stripe', grupo: 'cobros', proveedor: 'stripe', conectores: ['stripe_payments'], asistente: 'llaves', llaves: 'stripe', conectorReal: true },
  { id: 'paypal', grupo: 'cobros', proveedor: 'paypal', conectores: ['paypal_checkout'], asistente: 'llaves', llaves: 'paypal', conectorReal: true },
  // Hospedaje y agencias de viaje (5). Booking/Expedia: el modo iCal es real; el de API pide
  // cuenta de proveedor de conectividad (el asistente lo dice en su paso «Modo»).
  { id: 'booking', grupo: 'hospedaje', proveedor: 'booking', conectores: ['booking_ota', 'booking_ical'], asistente: 'ota', conectorReal: true },
  { id: 'expedia', grupo: 'hospedaje', proveedor: 'expedia', conectores: ['expedia_ota', 'expedia_ical'], asistente: 'ota', conectorReal: true },
  { id: 'airbnb', grupo: 'hospedaje', proveedor: 'airbnb', conectores: ['airbnb_ical'], asistente: 'ical', conectorReal: true },
  { id: 'tripadvisor', grupo: 'hospedaje', proveedor: 'tripadvisor', conectores: ['tripadvisor_ical', 'tripadvisor_content'], asistente: 'ical', conectorReal: true },
  { id: 'google_vacation_rentals', grupo: 'hospedaje', proveedor: 'google_vacation_rentals', conectores: ['google_vacation_rentals_ical'], asistente: 'ical', conectorReal: true },
  // Apps de domicilios (3): sin conector en la base ni API de aliado en el código.
  { id: 'rappi', grupo: 'domicilios', proveedor: 'rappi', conectores: [], asistente: 'domicilios', conectorReal: false, motivo: 'cuenta_socio' },
  { id: 'ubereats', grupo: 'domicilios', proveedor: 'ubereats', conectores: [], asistente: 'domicilios', conectorReal: false, motivo: 'cuenta_socio' },
  { id: 'ifood', grupo: 'domicilios', proveedor: 'ifood', conectores: [], asistente: 'domicilios', conectorReal: false, motivo: 'cuenta_socio' },
  // Publicidad y redes (3): OAuth existente en /api/integrations/{meta,tiktok,google-ads}/oauth.
  { id: 'meta', grupo: 'publicidad', proveedor: 'meta', conectores: ['meta_marketing'], asistente: 'oauth', oauth: 'meta', conectorReal: true },
  { id: 'tiktok', grupo: 'publicidad', proveedor: 'tiktok', conectores: ['tiktok_marketing'], asistente: 'oauth', oauth: 'tiktok', conectorReal: true },
  { id: 'google_ads', grupo: 'publicidad', proveedor: 'google_ads', conectores: ['google_ads'], asistente: 'oauth', oauth: 'google_ads', conectorReal: true },
  // Mensajería y canales (3): un solo dueño por canal (análisis §Propuesta 4).
  { id: 'whatsapp', grupo: 'mensajeria', proveedor: 'whatsapp', conectores: ['whatsapp_cloud'], asistente: 'enlace', enlace: '/app/chat/canales', conectorReal: true },
  { id: 'instagram_facebook', grupo: 'mensajeria', proveedor: null, conectores: [], asistente: 'enlace', enlace: '/app/chat/canales', conectorReal: true },
  { id: 'sendgrid', grupo: 'mensajeria', proveedor: 'sendgrid', conectores: ['sendgrid_email'], asistente: 'llaves', llaves: 'sendgrid', conectorReal: true },
  // Envíos (6): flujo de logística (route handler + bóveda); el estado del adaptador lo decide
  // `entradaRegistro` de @/lib/integrations/core/registro.
  { id: 'coordinadora', grupo: 'envios', proveedor: 'coordinadora', conectores: ['coordinadora'], asistente: 'logistica', conectorReal: true },
  { id: 'servientrega', grupo: 'envios', proveedor: 'servientrega', conectores: ['servientrega'], asistente: 'logistica', conectorReal: true },
  { id: 'envia', grupo: 'envios', proveedor: 'envia', conectores: ['envia'], asistente: 'logistica', conectorReal: true },
  { id: 'interrapidisimo', grupo: 'envios', proveedor: 'interrapidisimo', conectores: ['interrapidisimo'], asistente: 'logistica', conectorReal: true },
  { id: 'dropi', grupo: 'envios', proveedor: 'dropi', conectores: ['dropi'], asistente: 'logistica', conectorReal: true },
  { id: 'effi', grupo: 'envios', proveedor: 'effi', conectores: ['effi'], asistente: 'logistica', conectorReal: true },
  // Servicios de GO Admin (4): sin llaves del cliente.
  { id: 'cobros_qr', grupo: 'go_admin', proveedor: null, conectores: [], asistente: 'enlace', enlace: '/app/finanzas/metodos-pago', conectorReal: true },
  { id: 'facturacion_electronica', grupo: 'go_admin', proveedor: null, conectores: [], asistente: 'enlace', enlace: '/app/finanzas/facturacion-electronica', conectorReal: true },
  { id: 'conectar_banco', grupo: 'go_admin', proveedor: null, conectores: [], asistente: 'enlace', enlace: '/app/finanzas/open-finance', conectorReal: true },
  { id: 'sms_llamadas', grupo: 'go_admin', proveedor: null, conectores: [], asistente: 'enlace', enlace: '/app/integraciones/twilio', conectorReal: true },
];

/** Proveedores de la base que el catálogo agrupa en un servicio de GO Admin (no se repiten). */
export const PROVEEDORES_DE_GO_ADMIN: Readonly<Record<string, string>> = {
  bancolombia: 'cobros_qr',
  breb: 'cobros_qr',
  redeban: 'cobros_qr',
  twilio: 'sms_llamadas',
};

const GRUPO_POR_CATEGORIA: Readonly<Record<string, GrupoCatalogo>> = {
  payments: 'cobros',
  ota: 'hospedaje',
  delivery: 'envios',
  ads: 'publicidad',
  social: 'publicidad',
  messaging: 'mensajeria',
};

// ─── Entradas desde la base ─────────────────────────────────────────────────

export interface ProveedorBase {
  code: string;
  name: string;
  category: string;
  is_active: boolean;
}
export interface ConectorBase {
  code: string;
  provider_code: string;
  is_active: boolean;
}
export interface ConexionBase {
  id: string;
  connector_code: string;
  status: string;
  error_count_24h?: number | null;
  last_error_at?: string | null;
  connected_at?: string | null;
}

export interface EntradaCatalogo {
  proveedores: readonly ProveedorBase[];
  conectores: readonly ConectorBase[];
  conexiones: readonly ConexionBase[];
  /** Estado del adaptador de logística (`entradaRegistro(code)?.estado`). */
  estadoLogistica?: (code: string) => string | null;
  /** Apps OAuth configuradas en el servidor (variables de entorno presentes). */
  oauthConfigurado?: Partial<Record<'meta' | 'tiktok' | 'google_ads', boolean>>;
}

export interface ItemCatalogo {
  id: string;
  grupo: GrupoCatalogo;
  proveedor: string | null;
  /** Nombre de la base (o null: la UI usa el de i18n). */
  nombre: string | null;
  asistente: TipoAsistente;
  llaves?: ProveedorLlaves;
  enlace?: string;
  oauth?: 'meta' | 'tiktok' | 'google_ads';
  estado: EstadoCatalogo;
  motivo?: MotivoConstruccion;
  /** Conexiones vivas (no borrador ni revocadas) de este servicio. */
  conexiones: string[];
  /** Conexión principal (la que abre «Ver»). */
  conexionPrincipal: string | null;
}

const VIVAS = new Set(['connected', 'error', 'paused']);

/** ¿Una conexión necesita atención? */
export function conexionConProblemas(c: Pick<ConexionBase, 'status' | 'error_count_24h' | 'last_error_at' | 'connected_at'>): boolean {
  if (c.status === 'error' || c.status === 'paused') return true;
  if ((c.error_count_24h ?? 0) > 0) return true;
  return false;
}

function estadoPorConexiones(conexiones: readonly ConexionBase[]): EstadoCatalogo | null {
  const vivas = conexiones.filter((c) => VIVAS.has(c.status));
  if (vivas.length === 0) return null;
  return vivas.some(conexionConProblemas) ? 'revisar' : 'conectado';
}

export function construirCatalogo(e: EntradaCatalogo): ItemCatalogo[] {
  const proveedores = new Map(e.proveedores.map((p) => [p.code, p]));
  const conectoresActivos = new Set(e.conectores.filter((c) => c.is_active).map((c) => c.code));
  const conectoresDeProveedor = (code: string) => e.conectores.filter((c) => c.provider_code === code && c.is_active).map((c) => c.code);

  const items: ItemCatalogo[] = SERVICIOS.map((s) => {
    const conexiones = e.conexiones.filter((c) => s.conectores.includes(c.connector_code));
    const vivas = conexiones.filter((c) => VIVAS.has(c.status));
    const base: ItemCatalogo = {
      id: s.id,
      grupo: s.grupo,
      proveedor: s.proveedor,
      nombre: s.proveedor ? proveedores.get(s.proveedor)?.name ?? null : null,
      asistente: s.asistente,
      llaves: s.llaves,
      enlace: s.enlace,
      oauth: s.oauth,
      estado: 'disponible',
      conexiones: vivas.map((c) => c.id),
      conexionPrincipal: (vivas.find((c) => c.status === 'connected') ?? vivas[0])?.id ?? null,
    };
    if (s.grupo === 'go_admin') return { ...base, estado: 'servicio_go_admin' };

    // Una conexión viva manda: el cliente ya la tiene, se muestra su estado real.
    const porConexion = estadoPorConexiones(conexiones);
    if (porConexion) return { ...base, estado: porConexion };

    const enConstruccion = (motivo: MotivoConstruccion): ItemCatalogo => ({ ...base, estado: 'en_construccion', motivo });
    if (s.proveedor) {
      const p = proveedores.get(s.proveedor);
      if (!p || !p.is_active) return enConstruccion('sin_proveedor_en_base');
      if (s.conectores.length === 0 || !s.conectores.some((c) => conectoresActivos.has(c))) {
        return enConstruccion(s.motivo ?? 'sin_conector');
      }
    }
    if (!s.conectorReal) return enConstruccion(s.motivo ?? 'sin_conector_en_codigo');
    if (s.asistente === 'logistica') {
      const estado = e.estadoLogistica?.(s.id) ?? null;
      if (estado !== 'disponible') return enConstruccion('adaptador_en_construccion');
    }
    if (s.oauth && !e.oauthConfigurado?.[s.oauth]) return enConstruccion('app_oauth_sin_configurar');
    return base;
  });

  // Proveedores activos de la base que el catálogo no conoce: se muestran, honestos.
  const conocidos = new Set([...SERVICIOS.map((s) => s.proveedor).filter(Boolean), ...Object.keys(PROVEEDORES_DE_GO_ADMIN)]);
  for (const p of e.proveedores) {
    if (!p.is_active || conocidos.has(p.code)) continue;
    const conectores = conectoresDeProveedor(p.code);
    const conexiones = e.conexiones.filter((c) => conectores.includes(c.connector_code));
    const vivas = conexiones.filter((c) => VIVAS.has(c.status));
    const porConexion = estadoPorConexiones(conexiones);
    items.push({
      id: p.code,
      grupo: GRUPO_POR_CATEGORIA[p.category] ?? 'mensajeria',
      proveedor: p.code,
      nombre: p.name,
      asistente: 'avanzado',
      enlace: `/app/integraciones/conexiones/nueva?provider=${encodeURIComponent(p.code)}`,
      estado: porConexion ?? 'en_construccion',
      motivo: porConexion ? undefined : 'sin_conector_en_codigo',
      conexiones: vivas.map((c) => c.id),
      conexionPrincipal: vivas[0]?.id ?? null,
    });
  }
  return items;
}

/** Conteo por grupo para los chips del catálogo («Todos 30», «Cobros 6»…). */
export function conteoPorGrupo(items: readonly ItemCatalogo[]): Record<GrupoCatalogo | 'todos', number> {
  const salida = { todos: items.length } as Record<GrupoCatalogo | 'todos', number>;
  for (const g of GRUPOS) salida[g] = items.filter((i) => i.grupo === g).length;
  return salida;
}

/** Filtro de texto (nombre de la base o id) y de grupo. */
export function filtrarCatalogo(
  items: readonly ItemCatalogo[],
  grupo: GrupoCatalogo | 'todos',
  texto: string,
  nombreDe: (i: ItemCatalogo) => string,
): ItemCatalogo[] {
  const q = texto.trim().toLocaleLowerCase('es');
  return items.filter((i) => (grupo === 'todos' || i.grupo === grupo) && (!q || nombreDe(i).toLocaleLowerCase('es').includes(q)));
}

/**
 * A qué asistente va cada «Conectar» (Frente INT, 2026-11-07). Todas las entradas de la app
 * (Métodos de pago, formulario de método, PMS, onboarding, catálogo) llevan al asistente NUEVO de
 * Integraciones › Conexiones; `/app/integraciones/conexiones/nueva` (el formulario viejo) redirige
 * en el servidor salvo para lo que el nuevo no cubre:
 *  - Bold (datáfonos por sucursal) y los rieles de cobro QR propios (Bancolombia QR, Bre-B,
 *    Redeban): su configuración avanzada (terminales, llave Bre-B) vive solo en el formulario viejo;
 *  - WhatsApp y Twilio (sus credenciales las guarda el formulario viejo; el catálogo los enlaza a
 *    su dueño: Chat › Canales / créditos de la plataforma);
 *  - proveedores que la base tenga y el catálogo no conozca.
 * Puro: sin Supabase ni React.
 */
import { SERVICIOS, type DefinicionServicio } from './catalogoConexiones';

export const RUTA_CONEXIONES = '/app/integraciones/conexiones';
export const RUTA_LOGISTICA = '/app/integraciones/conexiones/logistica';

/** Tipos de asistente que el NUEVO resuelve por sí mismo. */
const CUBIERTOS = new Set<DefinicionServicio['asistente']>(['llaves', 'ota', 'ical', 'oauth', 'domicilios', 'logistica']);

/** Códigos de MÉTODO DE PAGO (`payment_methods.code`) que no coinciden con el del proveedor. */
const ALIAS_METODO_PAGO: Readonly<Record<string, string>> = {
  mp: 'mercadopago',
};

/**
 * Servicio del catálogo que atiende `entrada` en el asistente nuevo (id de servicio, código de
 * proveedor o código de método de pago), o null si debe seguir en el formulario viejo.
 */
export function servicioDelAsistenteNuevo(entrada: string | null | undefined): DefinicionServicio | null {
  const codigo = (entrada ?? '').trim().toLowerCase();
  if (!codigo) return null;
  const id = ALIAS_METODO_PAGO[codigo] ?? codigo;
  const s = SERVICIOS.find((x) => x.id === id || x.proveedor === id);
  return s && CUBIERTOS.has(s.asistente) ? s : null;
}

/** Solo rutas internas de la app (nunca otro origen ni `//`). */
export function rutaInterna(r: string | null | undefined): string | null {
  const v = (r ?? '').trim();
  return /^\/app\/[A-Za-z0-9/_?=&.%-]*$/.test(v) && !v.startsWith('//') ? v : null;
}

export interface OpcionesRuta {
  /** A dónde volver al terminar (solo rutas internas). */
  volver?: string | null;
  sucursalId?: number | null;
}

/** URL del asistente nuevo para un servicio, con proveedor elegido, sucursal y regreso. */
export function rutaAsistenteNuevo(servicio: Pick<DefinicionServicio, 'id' | 'asistente'>, opciones: OpcionesRuta = {}): string {
  const q = new URLSearchParams();
  if (servicio.asistente === 'logistica') {
    q.set('proveedor', servicio.id);
  } else {
    q.set('conectar', servicio.id);
  }
  const volver = rutaInterna(opciones.volver);
  if (volver) q.set('return', volver);
  if (opciones.sucursalId != null && Number.isInteger(opciones.sucursalId) && opciones.sucursalId > 0) q.set('sucursal', String(opciones.sucursalId));
  return `${servicio.asistente === 'logistica' ? RUTA_LOGISTICA : RUTA_CONEXIONES}?${q.toString()}`;
}

/** Atajo: URL nueva para un código (proveedor o método de pago), o null si no la cubre. */
export function rutaConectar(codigo: string, opciones: OpcionesRuta = {}): string | null {
  const s = servicioDelAsistenteNuevo(codigo);
  return s ? rutaAsistenteNuevo(s, opciones) : null;
}

export interface ParametrosAsistenteViejo {
  mode?: string | null;
  /** Conexión a editar o duplicar. */
  id?: string | null;
  /** Código del proveedor (ya resuelto si llegó un uuid). */
  proveedor?: string | null;
  /** Código del conector de la conexión en edición/duplicado. */
  proveedorDeConexion?: string | null;
  volver?: string | null;
  sucursalId?: number | null;
}

/**
 * Destino de `/app/integraciones/conexiones/nueva` o null para quedarse en el formulario viejo.
 *  - crear con un proveedor cubierto → asistente nuevo con ese proveedor;
 *  - editar una conexión cubierta → su detalle (allí está «Reemplazar llave»);
 *  - duplicar una conexión cubierta → asistente nuevo del mismo proveedor;
 *  - sin proveedor → catálogo nuevo (elegir proveedor ya no se hace en el formulario viejo).
 */
export function destinoDelAsistenteViejo(p: ParametrosAsistenteViejo): string | null {
  const modo = p.mode === 'edit' || p.mode === 'duplicate' ? p.mode : 'create';
  if (modo === 'create') {
    if (!p.proveedor) return RUTA_CONEXIONES;
    const s = servicioDelAsistenteNuevo(p.proveedor);
    return s ? rutaAsistenteNuevo(s, { volver: p.volver, sucursalId: p.sucursalId }) : null;
  }
  const s = servicioDelAsistenteNuevo(p.proveedorDeConexion);
  if (!s) return null;
  if (modo === 'edit' && p.id && /^[0-9a-f-]{36}$/i.test(p.id)) return `${RUTA_CONEXIONES}/${p.id}`;
  return rutaAsistenteNuevo(s, { volver: p.volver, sucursalId: p.sucursalId });
}

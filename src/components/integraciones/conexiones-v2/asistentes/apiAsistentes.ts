/**
 * Llamadas del navegador de los asistentes OTA, iCal y OAuth (Frente INT). La organización y los
 * permisos los resuelve el servidor por la sesión; aquí no viaja ninguna organización.
 */
import { interpretarOauth, interpretarVerificacionOta, RUTA_OAUTH, type ProveedorOauth, type ResultadoOauth, type ResultadoVerificacionOta } from './pasosLogica';

export type CanalIcal = 'airbnb' | 'booking' | 'expedia' | 'tripadvisor' | 'google_vacation_rentals';
export type CanalOta = 'booking' | 'expedia';

export interface EspacioPms {
  id: string;
  nombre: string;
  sucursal: string | null;
}

export interface EnlaceIcal {
  espacioId: string;
  urlImportacion: string | null;
  urlExportacion: string | null;
  ultimaSync: string | null;
  estadoSync: string | null;
  error: string | null;
}

export class ErrorAsistente extends Error {
  constructor(public readonly status: number, public readonly codigo: string, message: string) {
    super(message);
    this.name = 'ErrorAsistente';
  }
}

async function pedir(url: string, init?: RequestInit): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, cuerpo };
}

function exigirOk<T>(r: { status: number; cuerpo: Record<string, unknown> }): T {
  if (r.status < 200 || r.status >= 300) {
    throw new ErrorAsistente(r.status, String(r.cuerpo.codigo ?? r.cuerpo.code ?? 'ERROR'), String(r.cuerpo.error ?? `HTTP ${r.status}`));
  }
  return r.cuerpo as T;
}

export const apiAsistentes = {
  ical: async (canal: CanalIcal) =>
    exigirOk<{ espacios: EspacioPms[]; enlaces: EnlaceIcal[] }>(await pedir(`/api/integrations/conexiones/ical?canal=${encodeURIComponent(canal)}`)),

  guardarIcal: async (canal: CanalIcal, enlaces: { espacioId: string; urlImportacion: string }[]) =>
    exigirOk<{ conexionId: string; enlaces: { espacioId: string; urlExportacion: string }[] }>(
      await pedir('/api/integrations/conexiones/ical', { method: 'POST', body: JSON.stringify({ canal, enlaces }) }),
    ),

  /** Sincroniza los calendarios iCal de la organización (ruta existente del PMS). */
  sincronizarIcal: async () => exigirOk<Record<string, unknown>>(await pedir('/api/pms/ical/sync', { method: 'POST', body: JSON.stringify({}) })),

  ota: async (canal: CanalOta) =>
    exigirOk<{ cuentaSocio: boolean; conexion: { id: string; propiedadId: string; estado: string } | null; espacios: EspacioPms[] }>(
      await pedir(`/api/integrations/conexiones/ota?canal=${encodeURIComponent(canal)}`),
    ),

  verificarOta: async (canal: CanalOta, propiedadId: string): Promise<{ resultado: ResultadoVerificacionOta; conexionId: string | null; mensaje: string | null }> => {
    const r = await pedir('/api/integrations/conexiones/ota', { method: 'POST', body: JSON.stringify({ canal, propiedadId }) });
    return {
      resultado: interpretarVerificacionOta(r.status, r.cuerpo),
      conexionId: typeof r.cuerpo.conexionId === 'string' ? r.cuerpo.conexionId : null,
      mensaje: typeof r.cuerpo.error === 'string' ? r.cuerpo.error : null,
    };
  },

  guardarHabitaciones: async (conexionId: string, relaciones: { espacioId: string; externoId: string }[]) =>
    exigirOk<{ guardadas: number }>(
      await pedir('/api/integrations/conexiones/ota/habitaciones', { method: 'POST', body: JSON.stringify({ conexionId, relaciones }) }),
    ),

  /** Trae reservas nuevas y modificadas de la OTA (rutas existentes del channel manager). */
  sincronizarOta: async (canal: CanalOta, conexionId: string) =>
    exigirOk<Record<string, unknown>>(
      await pedir(`/api/integrations/${canal}/poll-reservations`, { method: 'POST', body: JSON.stringify({ connectionId: conexionId }) }),
    ),

  autorizarOauth: async (proveedor: ProveedorOauth): Promise<ResultadoOauth> => {
    const r = await pedir(RUTA_OAUTH[proveedor], { method: 'POST', body: JSON.stringify({}) });
    return interpretarOauth(r.status, r.cuerpo);
  },

  /** Meta, pasos «Activos» y «Qué se envía» (85-42/43). El token nunca llega aquí. */
  activosMeta: async (conexionId: string, filtro: { negocio?: string; cuenta?: string } = {}) => {
    const q = new URLSearchParams({ conexion: conexionId });
    if (filtro.negocio) q.set('negocio', filtro.negocio);
    if (filtro.cuenta) q.set('cuenta', filtro.cuenta);
    return exigirOk<ActivosMetaUi>(await pedir(`/api/integrations/conexiones/meta?${q.toString()}`));
  },

  guardarActivosMeta: async (b: {
    conexion: string;
    negocio: string;
    cuenta: string;
    catalogo: string;
    pixel: string;
    envios: { catalogo: boolean; compras: boolean };
  }) => exigirOk<{ catalogo: OpcionMetaUi; pixel: OpcionMetaUi }>(await pedir('/api/integrations/conexiones/meta', { method: 'POST', body: JSON.stringify(b) })),
};

export interface OpcionMetaUi {
  id: string;
  nombre: string;
  moneda?: string;
}

export interface ActivosMetaUi {
  autorizada: boolean;
  negocios: OpcionMetaUi[];
  cuentas: OpcionMetaUi[];
  catalogos: OpcionMetaUi[];
  pixeles: OpcionMetaUi[];
  seleccion: { negocio: string; cuenta: string; catalogo: string; pixel: string };
  envios: { catalogo: boolean; compras: boolean };
  productosTienda: number | null;
}

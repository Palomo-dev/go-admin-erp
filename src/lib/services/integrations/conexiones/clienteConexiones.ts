/**
 * Cliente de NAVEGADOR de `/api/integrations/conexiones/**` y `/api/integrations/desarrolladores/**`
 * (Frente INT). Sin Supabase: la organización y los permisos los resuelve el servidor por la sesión.
 * Los tipos de respuesta son los de los módulos de servidor (solo `import type`).
 */
import type { ItemCatalogo } from './catalogoConexiones';
import type { ConexionResumen, EventoCompleto, EventoResumen, ResultadoGuardarLlaves } from './conexiones.server';
import type { CuentaVerificada, Prueba } from './probadoresLlaves.server';
import type { CambiosLlave, CambiosWebhook, EntradaWebhook, LlaveApiResumen, ResultadoEnvio, WebhookSalienteResumen } from './desarrolladores.server';
import type { Ambiente, ErrorFormato, ProveedorLlaves } from './definicionesLlaves';

export type { CuentaVerificada };
export type { ItemCatalogo, ConexionResumen, EventoResumen, EventoCompleto, Prueba, LlaveApiResumen, ResultadoEnvio, WebhookSalienteResumen, CambiosLlave, CambiosWebhook, EntradaWebhook };

export interface DetalleConexion {
  conexion: {
    id: string;
    nombre: string;
    proveedor: string;
    proveedorNombre: string;
    conector: string;
    conectorNombre: string;
    ambiente: string;
    estado: string;
    sucursalId: number | null;
    ultimaPrueba: string | null;
    ultimoError: string | null;
    ultimoErrorEn: string | null;
    errores24h: number;
    conectadaEn: string | null;
    creada: string | null;
    ajustes: { hotelId: string | null; propertyId: string | null; modo: string | null };
    /** «Conectado como …» (lo que el proveedor dijo en la última prueba correcta). */
    cuentaVerificada: (CuentaVerificada & { verificadaEn?: string | null }) | null;
  };
  credenciales: { proposito: string; tipo: string; mascara: string | null; enBoveda: boolean; actualizada: string | null }[];
  usadaPor: ConexionResumen['usadaPor'];
  eventos: EventoResumen[];
  webhookUrl: string | null;
  /** `tienda`: la del dominio principal verificado (Wompi); `erp`: la del ERP. */
  webhookOrigen: 'tienda' | 'erp' | null;
  /** Wompi sin dominio principal verificado: se muestra la del ERP y la UI explica por qué. */
  webhookSinDominio: boolean;
  asistenteLlaves: ProveedorLlaves | null;
}

/** Error de la API con su `codigo` (p. ej. FORMATO, METODO_EN_USO, CUENTA_SOCIO, PENDIENTE_ACTIVAR). */
export class ErrorApiConexiones extends Error {
  constructor(public readonly status: number, public readonly codigo: string, message: string, public readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ErrorApiConexiones';
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { error, codigo, code, ...extra } = json;
    throw new ErrorApiConexiones(res.status, String(codigo ?? code ?? 'ERROR'), String(error ?? `HTTP ${res.status}`), extra);
  }
  return json as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export interface FiltrosEventosCliente {
  conexion?: string | null;
  errores?: boolean;
  /** Solo los que llegaron por webhook del proveedor (`source = webhook`). */
  soloWebhooks?: boolean;
  /** Solo las pruebas de conexión. */
  soloPruebas?: boolean;
  estado?: string | null;
  sentido?: 'inbound' | 'outbound' | null;
  desde?: string | null;
  hasta?: string | null;
  q?: string | null;
  pagina?: number;
  tamano?: number;
  limite?: number;
}

export interface RespuestaEventos {
  eventos: EventoResumen[];
  /** Eventos con error en los últimos 30 días (para el chip «Con error · n»). */
  errores: number;
  total: number;
  pagina: number;
  tamano: number;
}

export const apiConexiones = {
  listar: () =>
    pedir<{ catalogo: ItemCatalogo[]; conexiones: ConexionResumen[]; conectores: { id: string; nombre: string }[] }>('/api/integrations/conexiones'),
  detalle: (id: string) => pedir<DetalleConexion>(`/api/integrations/conexiones/${encodeURIComponent(id)}`),
  probar: (id: string) => pedir<Prueba & { proveedor: string }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/probar`, { method: 'POST' }),
  guardarLlaves: (b: { proveedor: ProveedorLlaves; ambiente: Ambiente; valores: Record<string, string>; conexionId?: string | null; nombre?: string | null; sucursalId?: number | null }) =>
    pedir<ResultadoGuardarLlaves>('/api/integrations/conexiones/llaves', post(b)),
  enlazarUso: (id: string, b: { tienda: boolean; pos: boolean; sucursales: number[] }) =>
    pedir<{ metodo: string; creado: boolean }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/uso`, post(b)),
  cambiarEstado: (id: string, accion: 'pausar' | 'reanudar' | 'desconectar') =>
    pedir<{ estado: string }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/estado`, post({ accion })),
  eventos: (f: FiltrosEventosCliente = {}) => {
    const q = new URLSearchParams();
    if (f.conexion) q.set('conexion', f.conexion);
    if (f.errores) q.set('errores', '1');
    if (f.soloWebhooks) q.set('webhooks', '1');
    if (f.soloPruebas) q.set('pruebas', '1');
    if (f.estado) q.set('estado', f.estado);
    if (f.sentido) q.set('sentido', f.sentido);
    if (f.desde) q.set('desde', f.desde);
    if (f.hasta) q.set('hasta', f.hasta);
    if (f.q) q.set('q', f.q);
    if (f.pagina) q.set('pagina', String(f.pagina));
    if (f.tamano) q.set('tamano', String(f.tamano));
    if (f.limite) q.set('limite', String(f.limite));
    return pedir<RespuestaEventos>(`/api/integrations/conexiones/eventos?${q.toString()}`);
  },
  /** Un evento con su cuerpo completo (lo que mostraba la página vieja de detalle). */
  evento: (id: string) => pedir<EventoCompleto>(`/api/integrations/conexiones/eventos/${encodeURIComponent(id)}`),
  /** Valor de una credencial (administración, auditado en el servidor). Nunca se guarda en el navegador. */
  revelarCredencial: (id: string, proposito: string) =>
    pedir<{ proposito: string; valor: string; origen: 'registro' | 'boveda' }>(
      `/api/integrations/conexiones/${encodeURIComponent(id)}/credenciales/revelar`,
      post({ proposito }),
    ),
  eliminar: (id: string) => pedir<{ eliminada: true }>(`/api/integrations/conexiones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importar: (b: { conector: string; filas: { nombre: string; sucursalId?: number | null; pais?: string | null; ambiente?: string | null }[] }) =>
    pedir<{ creadas: number; fallidas: number; errores: string[] }>('/api/integrations/conexiones/importar', post(b)),
  llavesApi: () => pedir<{ llaves: LlaveApiResumen[] }>('/api/integrations/desarrolladores/llaves'),
  crearLlaveApi: (b: { nombre: string; alcances: string[]; expira?: string | null }) =>
    pedir<{ llave: LlaveApiResumen; completa: string }>('/api/integrations/desarrolladores/llaves', post(b)),
  editarLlaveApi: (id: string, b: CambiosLlave) =>
    pedir<{ llave: LlaveApiResumen }>(`/api/integrations/desarrolladores/llaves/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(b) }),
  revocarLlaveApi: (id: string) => pedir<{ revocada: true }>(`/api/integrations/desarrolladores/llaves/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  borrarLlaveApi: (id: string) => pedir<{ borrada: true }>(`/api/integrations/desarrolladores/llaves/${encodeURIComponent(id)}/borrar`, { method: 'DELETE' }),
  webhooks: () => pedir<{ webhooks: WebhookSalienteResumen[] }>('/api/integrations/desarrolladores/webhooks'),
  /** Devuelve el secreto de firma completo UNA vez. */
  crearWebhook: (b: EntradaWebhook) => pedir<{ webhook: WebhookSalienteResumen; secreto: string }>('/api/integrations/desarrolladores/webhooks', post(b)),
  editarWebhook: (id: string, b: CambiosWebhook) =>
    pedir<{ webhook: WebhookSalienteResumen }>(`/api/integrations/desarrolladores/webhooks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(b) }),
  borrarWebhook: (id: string) => pedir<{ borrado: true }>(`/api/integrations/desarrolladores/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Secreto nuevo (el anterior deja de valer); se devuelve completo UNA vez. */
  regenerarSecretoWebhook: (id: string) =>
    pedir<{ webhook: WebhookSalienteResumen; secreto: string }>(`/api/integrations/desarrolladores/webhooks/${encodeURIComponent(id)}/secreto`, { method: 'POST' }),
  probarWebhook: (id: string) => pedir<ResultadoEnvio>(`/api/integrations/desarrolladores/webhooks/${encodeURIComponent(id)}/probar`, { method: 'POST' }),
};

export type { ErrorFormato };

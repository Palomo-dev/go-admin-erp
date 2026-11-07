/**
 * Cliente de NAVEGADOR de `/api/integrations/conexiones/**` y `/api/integrations/desarrolladores/**`
 * (Frente INT). Sin Supabase: la organización y los permisos los resuelve el servidor por la sesión.
 * Los tipos de respuesta son los de los módulos de servidor (solo `import type`).
 */
import type { ItemCatalogo } from './catalogoConexiones';
import type { ConexionResumen, EventoResumen } from './conexiones.server';
import type { Prueba } from './probadoresLlaves.server';
import type { LlaveApiResumen, ResultadoEnvio, WebhookSalienteResumen } from './desarrolladores.server';
import type { Ambiente, ErrorFormato, ProveedorLlaves } from './definicionesLlaves';

export type { ItemCatalogo, ConexionResumen, EventoResumen, Prueba, LlaveApiResumen, ResultadoEnvio, WebhookSalienteResumen };

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
  };
  credenciales: { proposito: string; tipo: string; mascara: string | null; enBoveda: boolean; actualizada: string | null }[];
  usadaPor: ConexionResumen['usadaPor'];
  eventos: EventoResumen[];
  webhookUrl: string | null;
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

export const apiConexiones = {
  listar: () => pedir<{ catalogo: ItemCatalogo[]; conexiones: ConexionResumen[] }>('/api/integrations/conexiones'),
  detalle: (id: string) => pedir<DetalleConexion>(`/api/integrations/conexiones/${encodeURIComponent(id)}`),
  probar: (id: string) => pedir<Prueba & { proveedor: string }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/probar`, { method: 'POST' }),
  guardarLlaves: (b: { proveedor: ProveedorLlaves; ambiente: Ambiente; valores: Record<string, string>; conexionId?: string | null; nombre?: string | null; sucursalId?: number | null }) =>
    pedir<{ conexionId: string; prueba: Prueba; webhookUrl: string | null }>('/api/integrations/conexiones/llaves', post(b)),
  enlazarUso: (id: string, b: { tienda: boolean; pos: boolean; sucursales: number[] }) =>
    pedir<{ metodo: string; creado: boolean }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/uso`, post(b)),
  cambiarEstado: (id: string, accion: 'pausar' | 'reanudar' | 'desconectar') =>
    pedir<{ estado: string }>(`/api/integrations/conexiones/${encodeURIComponent(id)}/estado`, post({ accion })),
  eventos: (f: { conexion?: string | null; errores?: boolean; desde?: string | null; limite?: number } = {}) => {
    const q = new URLSearchParams();
    if (f.conexion) q.set('conexion', f.conexion);
    if (f.errores) q.set('errores', '1');
    if (f.desde) q.set('desde', f.desde);
    if (f.limite) q.set('limite', String(f.limite));
    return pedir<{ eventos: EventoResumen[]; errores: number }>(`/api/integrations/conexiones/eventos?${q.toString()}`);
  },
  llavesApi: () => pedir<{ llaves: LlaveApiResumen[] }>('/api/integrations/desarrolladores/llaves'),
  crearLlaveApi: (b: { nombre: string; alcances: string[]; expira?: string | null }) =>
    pedir<{ llave: LlaveApiResumen; completa: string }>('/api/integrations/desarrolladores/llaves', post(b)),
  revocarLlaveApi: (id: string) => pedir<{ revocada: true }>(`/api/integrations/desarrolladores/llaves/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  webhooks: () => pedir<{ webhooks: WebhookSalienteResumen[] }>('/api/integrations/desarrolladores/webhooks'),
  probarWebhook: (id: string) => pedir<ResultadoEnvio>(`/api/integrations/desarrolladores/webhooks/${encodeURIComponent(id)}/probar`, { method: 'POST' }),
};

export type { ErrorFormato };

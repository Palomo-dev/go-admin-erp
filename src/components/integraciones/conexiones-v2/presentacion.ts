/**
 * Presentación de Conexiones (estados, tonos y textos de eventos). Sin React ni Supabase.
 * Los textos salen de i18n por clave; aquí solo se decide QUÉ clave y QUÉ tono.
 */
import type { TonoBadge } from '@/components/kit';
import type { EstadoCatalogo, GrupoCatalogo, ItemCatalogo } from '@/lib/services/integrations/conexiones/catalogoConexiones';
import type { EventoResumen } from '@/lib/services/integrations/conexiones/clienteConexiones';

export const TONO_ESTADO_CATALOGO: Record<EstadoCatalogo, TonoBadge> = {
  conectado: 'exito',
  disponible: 'neutro',
  revisar: 'advertencia',
  en_construccion: 'informacion',
  servicio_go_admin: 'marca',
};

/** Estado de `integration_connections.status` → clave i18n `estados.conexion.*` y tono. */
export function estadoConexion(status: string, necesitaAtencion: boolean): { clave: string; tono: TonoBadge } {
  if (status === 'paused') return { clave: 'pausada', tono: 'neutro' };
  if (status === 'revoked') return { clave: 'desconectada', tono: 'neutro' };
  if (status === 'draft') return { clave: 'borrador', tono: 'neutro' };
  if (status === 'error') return { clave: 'revisar', tono: 'peligro' };
  if (necesitaAtencion) return { clave: 'conErrores', tono: 'advertencia' };
  return { clave: 'activa', tono: 'exito' };
}

/** Resultado de un evento → clave i18n `actividad.resultado.*` y tono. */
export function resultadoEvento(e: Pick<EventoResumen, 'estado' | 'sentido' | 'error'>): { clave: string; tono: TonoBadge } {
  if (e.estado === 'error') {
    const codigo = codigoErrorEvento(e.error);
    if (codigo === 'firma') return { clave: 'firmaInvalida', tono: 'peligro' };
    if (codigo === 'rechazada') return { clave: 'rechazada', tono: 'peligro' };
    if (codigo === 'sin_respuesta') return { clave: 'sinRespuesta', tono: 'advertencia' };
    return { clave: 'conError', tono: 'peligro' };
  }
  if (e.estado === 'processed') return e.sentido === 'outbound' ? { clave: 'correcta', tono: 'exito' } : { clave: 'aplicada', tono: 'exito' };
  return { clave: 'recibida', tono: 'informacion' };
}

/**
 * Código de error conocido de un evento para explicarlo en el detalle. Lo escriben
 * `registrarEvento` («prueba:<resultado> (HTTP n)») y los webhooks.
 */
export function codigoErrorEvento(error: string | null | undefined): 'rechazada' | 'sin_respuesta' | 'sin_prueba' | 'firma' | 'otro' | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.startsWith('prueba:rechazada')) return 'rechazada';
  if (e.startsWith('prueba:sin_respuesta')) return 'sin_respuesta';
  if (e.startsWith('prueba:sin_prueba')) return 'sin_prueba';
  if (e.includes('firma') || e.includes('signature') || e.includes('checksum')) return 'firma';
  return 'otro';
}

/** Tipos de evento con texto propio en `actividad.tipos.*`; los demás se muestran tal cual. */
export const TIPOS_EVENTO_CONOCIDOS = [
  'prueba_de_conexion',
  'prueba_de_llaves_nuevas',
  'llaves_reemplazadas',
  'transaction.updated',
  'transaction.created',
] as const;

export function claveTipoEvento(tipo: string): string | null {
  return (TIPOS_EVENTO_CONOCIDOS as readonly string[]).includes(tipo) ? tipo.replace('.', '_') : null;
}

/** Orden de los grupos en el catálogo (85-00). */
export const ORDEN_GRUPOS: readonly GrupoCatalogo[] = ['cobros', 'hospedaje', 'domicilios', 'publicidad', 'mensajeria', 'envios', 'go_admin'];

/** Acción principal de la tarjeta del catálogo. */
export type AccionTarjeta = 'ver' | 'conectar' | 'ir';
export function accionDeTarjeta(item: Pick<ItemCatalogo, 'estado' | 'conexionPrincipal' | 'grupo' | 'asistente'>): AccionTarjeta {
  if (item.grupo === 'go_admin') return 'ir';
  if (item.conexionPrincipal) return 'ver';
  return 'conectar';
}

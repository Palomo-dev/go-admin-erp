import {
  canalesConError,
  detalleCanal,
  duracionCorta,
  estadoConexion,
  rutaDetalleCanal,
  tarjetasConectar,
  tiempoRelativo,
} from '../canalesLogica';
import type { ChannelCredentials, ChatChannel } from '@/lib/services/chatChannelsService';

const cred = (is_valid: boolean, extra: Partial<ChannelCredentials> = {}) =>
  ({ id: 'k', channel_id: 'c', provider: 'meta', credentials: {}, is_valid, last_validated_at: null, created_at: '', updated_at: '', ...extra }) as ChannelCredentials;

const canal = (p: Partial<ChatChannel>): ChatChannel =>
  ({ id: 'c1', type: 'whatsapp', status: 'active', public_key: 'pk', credentials: undefined, name: 'WA', ai_mode: 'hybrid', ...p }) as ChatChannel;

describe('estado de conexión de un canal (datos reales de la BD)', () => {
  it('Meta con credenciales válidas → conectado; inválidas → token vencido; sin credenciales → sin conectar', () => {
    expect(estadoConexion(canal({ credentials: cred(true) }))).toBe('conectado');
    expect(estadoConexion(canal({ credentials: cred(false) }))).toBe('tokenVencido');
    expect(estadoConexion(canal({}))).toBe('sinConectar');
  });
  it('el estado del canal manda: suspendido e inactivo', () => {
    expect(estadoConexion(canal({ status: 'suspended', credentials: cred(true) }))).toBe('suspendido');
    expect(estadoConexion(canal({ status: 'inactive', credentials: cred(false) }))).toBe('inactivo');
  });
  it('el widget web está conectado si tiene llave pública', () => {
    expect(estadoConexion(canal({ type: 'website' }))).toBe('conectado');
    expect(estadoConexion(canal({ type: 'website', public_key: null }))).toBe('sinConectar');
  });
  it('el aviso solo sale para token vencido o suspendido', () => {
    const lista = [canal({ id: 'a', credentials: cred(false) }), canal({ id: 'b', status: 'suspended' }), canal({ id: 'c', credentials: cred(true) }), canal({ id: 'd' })];
    expect(canalesConError(lista).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('rutas de detalle (ya no /canales/{id}/settings)', () => {
  it('cada tipo va a su página', () => {
    expect(rutaDetalleCanal({ id: '1', type: 'whatsapp' })).toBe('/app/chat/canales/whatsapp/1');
    expect(rutaDetalleCanal({ id: '1', type: 'instagram' })).toBe('/app/chat/canales/instagram/1');
    expect(rutaDetalleCanal({ id: '1', type: 'facebook' })).toBe('/app/chat/canales/facebook/1');
    expect(rutaDetalleCanal({ id: '1', type: 'website' })).toBe('/app/chat/canales/sitio-web/1');
    expect(rutaDetalleCanal({ id: '1', type: 'telegram' })).toBeNull();
  });
  it('WhatsApp abre la pestaña de la forma de conexión elegida', () => {
    expect(rutaDetalleCanal({ id: '1', type: 'whatsapp' }, 'qr_scan')).toBe('/app/chat/canales/whatsapp/1?conexion=qr_scan');
    expect(rutaDetalleCanal({ id: '1', type: 'website' }, 'qr_scan')).toBe('/app/chat/canales/sitio-web/1');
  });
});

describe('detalle y tarjetas', () => {
  it('no inventa números ni nombres de página', () => {
    expect(detalleCanal(canal({ credentials: cred(true, { connection_method: 'coexistence' }) }))).toEqual({ clave: 'conexion', valor: 'coexistence' });
    expect(detalleCanal(canal({ type: 'instagram', credentials: cred(true) }))).toEqual({ clave: 'cuentaVinculada' });
    expect(detalleCanal(canal({ type: 'facebook' }))).toEqual({ clave: 'sinCredenciales' });
  });
  it('ofrece «otro» cuando ya hay uno del tipo, y Telegram y Correo como próximamente', () => {
    const t = tarjetasConectar([{ type: 'whatsapp' }]);
    expect(t.find((x) => x.tipo === 'whatsapp')?.yaTiene).toBe(true);
    expect(t.find((x) => x.tipo === 'instagram')?.yaTiene).toBe(false);
    expect(t.filter((x) => x.proximamente).map((x) => x.tipo)).toEqual(['telegram', 'email']);
  });
});

describe('formatos', () => {
  const ahora = new Date('2026-11-13T15:00:00Z');
  it('tiempo relativo con Intl', () => {
    expect(tiempoRelativo('2026-11-13T14:57:00Z', ahora, 'es')).toBe('hace 3 minutos');
    expect(tiempoRelativo(null, ahora, 'es')).toBeNull();
  });
  it('duración corta', () => {
    expect(duracionCorta(45)).toBe('45 s');
    expect(duracionCorta(180)).toBe('3 min');
    expect(duracionCorta(4800)).toBe('1 h 20 min');
    expect(duracionCorta(null)).toBeNull();
  });
});

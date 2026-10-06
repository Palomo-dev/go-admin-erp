/**
 * Paquete D (restaurante): lógica pura de reservas de mesa — mensajes de error
 * de las RPC, aviso «no ha llegado» en la zona de la sede, URL del QR de mesa
 * y correo de recordatorio.
 */
import {
  CLAVES_ERROR_RESERVA,
  codigoErrorReserva,
  interpretarErrorReserva,
  mensajeErrorReserva,
} from '@/components/pos/reservas-mesas/erroresReserva';
import { readFileSync } from 'fs';
import { join } from 'path';
import { debeAvisarRetraso, enlaceTelefono, minutosDeRetraso } from '@/components/pos/reservas-mesas/retrasoReserva';
import { escaparHtml, urlQrMesa } from '@/lib/pos/mesas/qrMesa';
import { correoRecordatorioReserva, enlaceGestionReserva } from '@/lib/services/restaurante/recordatorioReserva';

describe('errores de las RPC de reservas → clave de i18n', () => {
  it('convierte el detalle sin tildes de la base en una clave con su número', () => {
    expect(interpretarErrorReserva({ message: 'PERSONAS: El numero maximo de personas es 12' })).toEqual({
      clave: 'personasMaximo',
      valores: { n: 12 },
    });
    expect(interpretarErrorReserva({ message: 'ANTICIPACION: No se puede cancelar con menos de 4 horas de anticipacion' })).toEqual({
      clave: 'cancelarMenosDeHoras',
      valores: { n: 4 },
    });
    expect(interpretarErrorReserva({ message: 'AFORO: La mesa ya tiene una reserva en ese horario' })?.clave).toBe('mesaConReserva');
    expect(interpretarErrorReserva({ message: 'PASADA: La hora de la reserva ya paso.' })?.clave).toBe('pasada');
    expect(interpretarErrorReserva({ message: 'mesa_ocupada' })?.clave).toBe('mesaOcupada');
    expect(interpretarErrorReserva({ message: 'x', code: 'PGRST202' })?.clave).toBe('migracionPendiente');
    expect(interpretarErrorReserva({ message: 'algo raro' })?.clave).toBe('desconocido');
    expect(codigoErrorReserva({ message: 'MESA: La mesa no pertenece a la sede' })).toBe('MESA');
  });
  it('el texto en español (registros) lleva tildes y el número', () => {
    expect(mensajeErrorReserva({ message: 'PERSONAS: El numero maximo de personas es 12' })).toBe('El número máximo de personas es 12.');
    expect(mensajeErrorReserva({ message: 'mesa_ocupada' })).toMatch(/cuenta abierta/);
    expect(mensajeErrorReserva(null, 'X')).toBe('X');
  });
  it.each(['es', 'en', 'fr', 'pt'])('messages/%s.json tiene todas las claves de posReservasMesas.errores', (idioma) => {
    const m = JSON.parse(readFileSync(join(__dirname, '..', '..', 'messages', `${idioma}.json`), 'utf8'));
    for (const clave of CLAVES_ERROR_RESERVA) expect(m.posReservasMesas.errores[clave]).toEqual(expect.any(String));
  });
});

describe('aviso «no ha llegado» (misma regla que fn_reservas_mesa_avisos_retraso)', () => {
  // 19:00 en Bogotá (UTC-5) = 00:00 UTC del día siguiente.
  const reserva = { status: 'confirmed', seated_at: null, reservation_date: '2026-10-10', reservation_time: '19:00:00' };
  const zona = 'America/Bogota';

  it('calcula el retraso con la hora de pared de la sede, no la del proceso', () => {
    expect(minutosDeRetraso(reserva, new Date('2026-10-11T00:20:00Z'), zona)).toBe(20);
  });
  it('avisa entre 15 min y 6 h tarde, y no si se pospuso, ya se sentó o no está confirmada', () => {
    const ahora = new Date('2026-10-11T00:20:00Z');
    expect(debeAvisarRetraso(reserva, ahora, zona)).toBe(true);
    expect(debeAvisarRetraso(reserva, new Date('2026-10-11T00:10:00Z'), zona)).toBe(false);
    expect(debeAvisarRetraso(reserva, new Date('2026-10-11T07:00:00Z'), zona)).toBe(false);
    expect(debeAvisarRetraso(reserva, ahora, zona, ahora.getTime() + 60_000)).toBe(false);
    expect(debeAvisarRetraso({ ...reserva, seated_at: '2026-10-11T00:05:00Z' }, ahora, zona)).toBe(false);
    expect(debeAvisarRetraso({ ...reserva, status: 'pending' }, ahora, zona)).toBe(false);
  });
  it('arma el tel: solo con un número usable', () => {
    expect(enlaceTelefono('+57 300 111 2233')).toBe('tel:+573001112233');
    expect(enlaceTelefono('12')).toBeNull();
  });
});

describe('QR de mesa (contrato con el sitio: /menu?mesa=<id>)', () => {
  const id = '53DFAB2C-87FF-4CE7-8393-7F102308D2C5';
  it('usa el host publicado y el id de la mesa', () => {
    expect(urlQrMesa('tienda.goadmin.io', id)).toBe('https://tienda.goadmin.io/menu?mesa=53dfab2c-87ff-4ce7-8393-7f102308d2c5');
    expect(urlQrMesa('https://mi-dominio.com/', id)).toBe('https://mi-dominio.com/menu?mesa=53dfab2c-87ff-4ce7-8393-7f102308d2c5');
  });
  it('sin sitio o con un id inválido no hay QR', () => {
    expect(urlQrMesa(null, id)).toBeNull();
    expect(urlQrMesa('tienda.goadmin.io', 'Mesa 4')).toBeNull();
    expect(urlQrMesa('evil.com/x?y=<script>', id)).toBeNull();
  });
  it('escapa el texto de la hoja imprimible', () => {
    expect(escaparHtml('<b>"Mesa"</b>')).toBe('&lt;b&gt;&quot;Mesa&quot;&lt;/b&gt;');
  });
});

describe('correo de recordatorio', () => {
  const datos = {
    customer_name: 'Ana Pérez',
    party_size: 2,
    reservation_date: '2026-10-10',
    reservation_time: '19:30:00',
    manage_token: '0b7e0d4e-9b6c-4f5b-9a77-1f1f1f1f1f1f',
    sede: 'Sede Norte',
    sede_direccion: 'Calle 1 # 2-3',
    organizacion: 'Restaurante de prueba',
  };
  it('formatea la fecha sin convertir de zona y enlaza la gestión por token', () => {
    const enlace = enlaceGestionReserva('tienda.goadmin.io', datos.manage_token);
    expect(enlace).toBe('https://tienda.goadmin.io/reserva/mesa/0b7e0d4e-9b6c-4f5b-9a77-1f1f1f1f1f1f');
    const c = correoRecordatorioReserva(datos, enlace);
    expect(c.asunto).toContain('10 de octubre');
    expect(c.asunto).toContain('19:30');
    expect(c.texto).toContain('Consultar o cancelar: https://tienda.goadmin.io/reserva/mesa/');
    expect(c.html).toContain('Sede Norte');
  });
  it('sin host o sin token no hay enlace', () => {
    expect(enlaceGestionReserva(null, datos.manage_token)).toBeNull();
    expect(enlaceGestionReserva('tienda.goadmin.io', null)).toBeNull();
  });
});

import { atencionDeFila, coincideBusqueda, cuandoDeFila, cuentaFiltrosExtra, esVista, filtrosDeVista } from '../bandejaLogica';
import { elementosHilo, fechaLargaDia, relacionDia } from '../../conversations/hiloLogica';
import type { AgenteChat } from '@/lib/services/chat/agentesChat';

const agentes: AgenteChat[] = [{ memberId: 7, userId: 'u7', nombre: 'Laura Restrepo', avatarUrl: null, cargo: 'Ventas', abiertas: 4, esYo: false }];

describe('Chat › vistas rápidas de la Bandeja', () => {
  test('filtros de cada vista', () => {
    expect(filtrosDeVista('abiertas', 7)).toEqual({ status: 'open' });
    expect(filtrosDeVista('mias', 7)).toEqual({ status: 'open', assigned_member_id: 7 });
    expect(filtrosDeVista('mias', null)).toBeNull();
    expect(filtrosDeVista('sinAsignar', 7)).toEqual({ status: 'open', unassigned: true });
    expect(filtrosDeVista('pendientes', 7)).toEqual({ status: 'pending' });
    expect(filtrosDeVista('cerradas', 7, { prioridad: 'high', canal: 'c1', etiqueta: null })).toEqual({ status: 'closed', priority: 'high', channel: 'c1' });
  });

  test('esVista y cuentaFiltrosExtra', () => {
    expect(esVista('mias')).toBe(true);
    expect(esVista('todas')).toBe(false);
    expect(esVista(null)).toBe(false);
    expect(cuentaFiltrosExtra({ prioridad: 'high', etiqueta: 'e1' })).toBe(2);
  });

  test('búsqueda por nombre sin tildes, mensaje y teléfono', () => {
    const c = { customer: { full_name: 'María Fernanda Ruiz', phone: '+57 310 555 0142' }, last_message: { content: '¿Tienen la talla 38?' } };
    expect(coincideBusqueda(c, 'maria')).toBe(true);
    expect(coincideBusqueda(c, 'talla 38')).toBe(true);
    expect(coincideBusqueda(c, '3105550142')).toBe(true);
    expect(coincideBusqueda(c, '555 01')).toBe(true);
    expect(coincideBusqueda(c, 'pedro')).toBe(false);
    expect(coincideBusqueda(c, '  ')).toBe(true);
  });

  test('atención: nombre corto del agente, IA automática o sin asignar', () => {
    expect(atencionDeFila({ assigned_member_id: 7 }, agentes)).toBe('Laura R.');
    expect(atencionDeFila({ assigned_member_id: null, channel: { ai_mode: 'auto' } }, agentes)).toBe('ia');
    expect(atencionDeFila({ assigned_member_id: null, channel: { ai_mode: 'hybrid' } }, agentes)).toBeNull();
  });

  test('cuándo: hora hoy, ayer, día de la semana y fecha (en la zona de la organización)', () => {
    const ahora = new Date('2026-11-13T15:00:00Z'); // 10:00 en Bogotá
    expect(cuandoDeFila('2026-11-13T14:00:00Z', 'America/Bogota', ahora)?.tipo).toBe('hora');
    // 03:00 UTC del 13 = 22:00 del 12 en Bogotá → «ayer»
    expect(cuandoDeFila('2026-11-13T03:00:00Z', 'America/Bogota', ahora)?.tipo).toBe('ayer');
    expect(cuandoDeFila('2026-11-10T15:00:00Z', 'America/Bogota', ahora)?.tipo).toBe('semana');
    expect(cuandoDeFila('2026-10-01T15:00:00Z', 'America/Bogota', ahora)?.tipo).toBe('fecha');
    expect(cuandoDeFila(null, 'America/Bogota', ahora)).toBeNull();
  });
});

describe('Chat › hilo con notas intercaladas', () => {
  const m = (id: string, created_at: string) => ({ id, created_at });
  const n = (id: string, created_at: string) => ({ id, created_at, note: 'ojo', member_id: 7 });

  test('intercala por fecha con un separador por día en la zona', () => {
    const els = elementosHilo([m('a', '2026-11-12T20:00:00Z'), m('b', '2026-11-13T15:00:00Z')], [n('x', '2026-11-13T14:00:00Z')], 'America/Bogota', false);
    expect(els.map((e) => e.clave)).toEqual(['d-2026-11-12', 'm-a', 'd-2026-11-13', 'n-x', 'm-b']);
  });

  test('con más historia por cargar, las notas más viejas que lo cargado no se muestran', () => {
    const els = elementosHilo([m('b', '2026-11-13T15:00:00Z')], [n('vieja', '2026-11-01T10:00:00Z')], 'America/Bogota', true);
    expect(els.some((e) => e.clave === 'n-vieja')).toBe(false);
    const todo = elementosHilo([m('b', '2026-11-13T15:00:00Z')], [n('vieja', '2026-11-01T10:00:00Z')], 'America/Bogota', false);
    expect(todo.some((e) => e.clave === 'n-vieja')).toBe(true);
  });

  test('relacionDia y fechaLargaDia', () => {
    expect(relacionDia('2026-11-13', '2026-11-13')).toBe('hoy');
    expect(relacionDia('2026-11-12', '2026-11-13')).toBe('ayer');
    expect(relacionDia('2026-11-01', '2026-11-13')).toBe('otro');
    expect(fechaLargaDia('2026-11-13', 'es')).toMatch(/viernes.*13.*noviembre/);
    expect(fechaLargaDia('mal', 'es')).toBe('mal');
  });
});

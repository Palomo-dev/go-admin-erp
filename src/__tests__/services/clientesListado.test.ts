/**
 * Listado de clientes (rediseño 2026-09-24): lo que la pantalla decide sin ir
 * a la base — traducción de la URL a la RPC, textos de la tarjeta móvil,
 * badges de cartera, CSV, WhatsApp y el juego de acciones del menú «⋯».
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

import { supabase } from '@/lib/supabase/config';
import {
  COLUMNAS_CSV,
  construirCsvClientes,
  documentoCliente,
  eliminarClientes,
  escaparCsv,
  estadoCarteraDetalle,
  listarClientes,
  mensajeErrorClientes,
  nombreCliente,
  parametrosFiltro,
  relacionesLegibles,
  telefonoWhatsApp,
  type FilaCliente,
} from '@/lib/services/clientesListadoService';
import { construirAccionesCliente } from '@/components/clientes/listado/accionesCliente';
import { aplanarMenuMasivo } from '@/components/kit/menuMasivo';
import { inicialesDe } from '@/components/kit/iniciales';
import { Tag, Users } from 'lucide-react';

const rpc = supabase.rpc as unknown as jest.Mock;

function fila(p: Partial<FilaCliente> = {}): FilaCliente {
  return {
    id: 'c1', customer_type: 'company', first_name: null, last_name: null, full_name: 'Café de ejemplo S.A.S.',
    company_name: 'Café de ejemplo S.A.S.', trade_name: null, email: 'a@b.co', phone: '3001234567',
    identification_type: 'NIT', identification_number: '901334221', dv: 7, address: null, city: null, notes: null,
    tags: ['premium'], roles: ['cliente'], preferences: {}, avatar_url: null, fiscal_responsibilities: ['R-99-PN'],
    fiscal_municipality_id: null, municipio_nombre: null, parent_customer_id: null, lifecycle_stage: 'customer',
    status: 'active', created_at: '2026-01-10T15:00:00Z', contacto_nombre: null, contacto_cargo: null,
    saldo: 0, facturas_abiertas: 0, facturas_vencidas: 0, dias_vencido: 0, estado_cartera: 'al_dia',
    compras: 0, total_compras: 0, ultima_compra: null, dias_desde_ultima_compra: null, plazo_dias: null, total_filas: 1,
    ...p,
  };
}

describe('URL → parámetros de fn_clientes_listado', () => {
  it('traduce los valores en español y descarta lo desconocido', () => {
    expect(parametrosFiltro({ busqueda: '  ferretería ', tipo: 'empresa', saldo: 'vencido', estado: 'inactivos' })).toEqual({
      p_busqueda: 'ferretería', p_tipo: 'company', p_rol: null, p_etiqueta: null, p_municipio: null, p_saldo: 'vencido', p_estado: 'inactive',
    });
    const raro = parametrosFiltro({ tipo: 'robot', saldo: 'drop table', municipio: 'no-es-uuid', estado: 'borrados' });
    expect(raro.p_tipo).toBeNull();
    expect(raro.p_saldo).toBeNull();
    expect(raro.p_municipio).toBeNull();
    // Sin estado (o con uno desconocido) se listan los activos.
    expect(raro.p_estado).toBe('active');
    expect(parametrosFiltro({ estado: 'todos' }).p_estado).toBe('todos');
  });

  it('pide una sola página al servidor con orden, rango y sucursal', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...fila(), saldo: '1500.5', total_filas: '42' }], error: null });
    const r = await listarClientes({
      organizationId: 120, branchId: 7, criterios: { tipo: 'persona' },
      orden: { campo: 'saldo', direccion: 'desc' }, desde: 20, tamano: 10,
    });
    expect(rpc).toHaveBeenCalledWith('fn_clientes_listado', expect.objectContaining({
      p_org: 120, p_branch: 7, p_tipo: 'person', p_orden: 'saldo', p_direccion: 'desc', p_limite: 10, p_desplazamiento: 20, p_ids: null,
    }));
    expect(r.total).toBe(42);
    expect(r.filas[0].saldo).toBe(1500.5);
  });

  it('eliminar clasifica en el servidor y devuelve los bloqueados con sus relaciones', async () => {
    rpc.mockResolvedValueOnce({
      data: { eliminados: 0, eliminables: ['c2'], bloqueados: [{ id: 'c1', nombre: 'X', relaciones: ['sales', 'invoice_sales'] }] },
      error: null,
    });
    const r = await eliminarClientes(120, ['c1', 'c2'], false);
    expect(rpc).toHaveBeenLastCalledWith('fn_clientes_eliminar', { p_org: 120, p_ids: ['c1', 'c2'], p_confirmar: false });
    expect(r.eliminables).toEqual(['c2']);
    expect(relacionesLegibles(r.bloqueados[0].relaciones)).toBe('ventas, facturas');
  });

  it('un 42501 de la RPC se explica como falta de permiso', () => {
    expect(mensajeErrorClientes({ code: '42501', message: 'x' }, 'otro')).toMatch(/permiso/);
    expect(mensajeErrorClientes({ code: 'XX000' }, 'Algo falló')).toBe('Algo falló');
  });
});

describe('Presentación de la fila', () => {
  it('documento: tipo, número y DV solo para NIT', () => {
    expect(documentoCliente({ identification_type: 'NIT', identification_number: '901334221', dv: 7 })).toBe('NIT 901334221-7');
    expect(documentoCliente({ identification_type: 'CC', identification_number: '55', dv: 3 })).toBe('CC 55');
    expect(documentoCliente({ identification_type: 'CC', identification_number: null, dv: null })).toBeNull();
  });

  it('detalle de cartera en escritorio: los días van dentro de la etiqueta', () => {
    expect(estadoCarteraDetalle(fila({ estado_cartera: 'vencido', dias_vencido: 12, saldo: 10 }))).toBe('Vencida 12 d');
    expect(estadoCarteraDetalle(fila({ estado_cartera: 'parcial', saldo: 10 }))).toBe('Pago parcial');
    expect(estadoCarteraDetalle(fila({ estado_cartera: 'al_dia', saldo: 0 }))).toBe('Al día');
  });

  it('nombre: nunca vacío', () => {
    expect(nombreCliente({ full_name: null, company_name: null, first_name: null, last_name: null, email: 'x@y.co' })).toBe('x@y.co');
    expect(nombreCliente({ full_name: null, company_name: null, first_name: null, last_name: null, email: null })).toBe('Sin nombre');
  });
});

describe('WhatsApp', () => {
  it('agrega el indicativo a un celular nacional y respeta el que ya trae', () => {
    expect(telefonoWhatsApp('300 123 4567')).toBe('573001234567');
    expect(telefonoWhatsApp('+52 55 1234 5678')).toBe('525512345678');
    expect(telefonoWhatsApp('3001234567', '593')).toBe('5933001234567');
    expect(telefonoWhatsApp('123')).toBeNull();
    expect(telefonoWhatsApp(null)).toBeNull();
  });
});

describe('CSV', () => {
  it('conserva las 23 columnas de antes, escapa y usa el día de la organización', () => {
    const csv = construirCsvClientes(
      [fila({ notes: 'dice "hola", y más', ultima_compra: '2026-09-01T03:00:00Z', compras: 2, total_compras: 150 })],
      'America/Bogota',
    );
    const [cabecera, linea] = csv.replace('﻿', '').split('\n');
    expect(cabecera.split(',')).toHaveLength(COLUMNAS_CSV.length);
    expect(COLUMNAS_CSV).toHaveLength(23);
    expect(linea).toContain('"dice ""hola"", y más"');
    // 03:00 UTC del 1 de septiembre es el 31 de agosto en Bogotá.
    expect(linea).toContain(',2026-08-31,');
    expect(escaparCsv(null)).toBe('');
  });
});

describe('Acciones del cliente (menú «⋯» y hoja móvil)', () => {
  const ctx = { navegar: jest.fn(), onCambiarEstado: jest.fn(), onEliminar: jest.fn(), onCopiarId: jest.fn() };

  it('tiene las 11 acciones del diseño, en orden, y lo que no tiene backend va deshabilitado con motivo', () => {
    const a = construirAccionesCliente({ id: 'c1', nombre: 'X', phone: '3001234567', status: 'active' }, ctx);
    expect(a.map((x) => x.etiqueta)).toEqual([
      'Ver detalle', 'Editar', 'Registrar pago', 'Nueva venta', 'Nueva oportunidad', 'Llamar', 'WhatsApp',
      'Estado de cuenta', 'Copiar identificador', 'Marcar inactivo', 'Eliminar',
    ]);
    for (const x of a.filter((y) => y.deshabilitada)) expect(x.motivo).toBeTruthy();
    expect(a.find((x) => x.id === 'registrar-pago')?.deshabilitada).toBe(true);
    expect(a.find((x) => x.id === 'estado-cuenta')?.deshabilitada).toBe(true);
    expect(a.find((x) => x.id === 'eliminar')?.destructiva).toBe(true);
  });

  it('sin teléfono, Llamar y WhatsApp se deshabilitan con motivo; un inactivo se reactiva', () => {
    const a = construirAccionesCliente({ id: 'c1', nombre: 'X', phone: null, status: 'inactive' }, { ...ctx, omitirVer: true });
    expect(a.find((x) => x.id === 'llamar')).toMatchObject({ deshabilitada: true, motivo: 'Sin teléfono registrado' });
    expect(a.find((x) => x.id === 'whatsapp')?.deshabilitada).toBe(true);
    expect(a.find((x) => x.id === 'ver')?.oculta).toBe(true);
    const reactivar = a.find((x) => x.id === 'reactivar');
    reactivar?.onSelect();
    expect(ctx.onCambiarEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'active');
  });

  it('nueva venta y nueva oportunidad llevan el cliente en la URL', () => {
    const a = construirAccionesCliente({ id: 'abc', nombre: 'X', phone: null, status: 'active' }, ctx);
    a.find((x) => x.id === 'nueva-venta')?.onSelect();
    a.find((x) => x.id === 'nueva-oportunidad')?.onSelect();
    expect(ctx.navegar).toHaveBeenCalledWith('/app/finanzas/facturas-venta/nuevo?cliente=abc');
    expect(ctx.navegar).toHaveBeenCalledWith('/app/crm/oportunidades/nuevo?cliente=abc');
  });
});

describe('Kit: menú de la barra masiva y avatar', () => {
  it('«Roles ▾» se aplana en móvil con el grupo delante y un divisor entre grupos', () => {
    const entradas = aplanarMenuMasivo({
      id: 'roles', etiqueta: 'Roles', icono: Users, onClick: () => undefined,
      menu: [
        { titulo: 'Agregar rol', acciones: [{ id: 'a', etiqueta: 'Cliente', icono: Tag, onSelect: () => undefined }] },
        { titulo: 'Quitar rol', acciones: [{ id: 'q', etiqueta: 'Cliente', icono: Tag, onSelect: () => undefined }] },
      ],
    });
    expect(entradas.map((e) => e.etiqueta)).toEqual(['Agregar rol: Cliente', 'Quitar rol: Cliente']);
    expect(entradas[0].separadorAntes).toBe(false);
    expect(entradas[1].separadorAntes).toBe(true);
    expect(aplanarMenuMasivo({ id: 'x', etiqueta: 'Exportar', icono: Tag, onClick: () => undefined })).toHaveLength(1);
  });

  it('iniciales', () => {
    expect(inicialesDe('María Fernanda Ríos')).toBe('MF');
    expect(inicialesDe('  ')).toBe('?');
    expect(inicialesDe('ana')).toBe('A');
  });
});

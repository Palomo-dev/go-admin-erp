/**
 * L58 (docs/implementacion/POS-PLAN.md §2.7): «Enviar a cocina» desde el
 * carrito. `enviarACocina` es la extracción literal de `handleSendComanda` de
 * `src/app/app/pos/page.tsx` con sus dependencias inyectadas. Las piezas que
 * usa (línea de la ronda, impresión de ajustes, estado por línea) ya las fijan
 * `cocinaLineasCarrito.test.ts` y `cocinaRutas.test.ts`; aquí, el orden y las
 * decisiones del envío.
 *
 * Datos inventados: sucursal 7.
 */
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));

import { enviarACocina, type DepsEnviarCocina, type TraductorCocina } from '@/lib/pos/venta/enviarCocina';
import { CocinaError } from '@/components/pos/cocina/cocinaCliente';
import type { RespuestaRonda, TicketRonda } from '@/lib/pos/cocina/lineasCarrito';
import type { Cart, CartItem, Category } from '@/components/pos/types';

const conPrep = { id: 1, name: 'Platos', requires_preparation: true, station: 'hot_kitchen' } as Category;
const sinPrep = { id: 2, name: 'Bebidas', requires_preparation: false, station: 'bar' } as Category;

const item = (id: string, categoria: Category | Category[], extra: Partial<CartItem['product']> & { station?: string | null } = {}) =>
  ({ id, product_id: 1, quantity: 1, unit_price: 1000, product: { id: 1, name: `Producto ${id}`, category: undefined, categories: categoria, ...extra } }) as unknown as CartItem;

const cart = (items: CartItem[], extra: Partial<Cart> = {}) => ({ id: 'cart-1', branch_id: 7, items, ...extra }) as Cart;

const ticket = (id: number, tipo: 'order' | 'adjustment', n: number, adjusts: number | null = null): TicketRonda => ({
  id, ticket_type: tipo, adjusts_ticket_id: adjusts, created_at: '2026-09-24T15:00:00Z', has_allergy: false,
  items: Array.from({ length: n }, (_, i) => ({
    id: i, cart_line_id: `l${i}`, product_name: `P${i}`, quantity: 1, quantity_delta: tipo === 'adjustment' ? 1 : null,
    adjustment_kind: tipo === 'adjustment' ? 'increase' : null, adjustment_reason: null, notes: null, is_allergy: false,
    station: 'hot_kitchen', variant_data: null, modifiers: null,
  })),
});

const respuesta = (tickets: TicketRonda[], replayed = false): RespuestaRonda => ({ replayed, first_ticket_id: tickets[0]?.id ?? null, tickets, lines: [] });

const t = Object.assign(
  (clave: string, valores?: Record<string, string | number>) => (valores ? `${clave} ${JSON.stringify(valores)}` : clave),
  { has: (clave: string) => clave === 'errores.sin_permiso' || clave === 'errores.error_interno' },
) as TraductorCocina;

function deps(r: RespuestaRonda = respuesta([ticket(900, 'order', 2)]), extra: Partial<DepsEnviarCocina> = {}) {
  const orden: string[] = [];
  const d: DepsEnviarCocina = {
    servicio: {
      setCartKitchenRoundKey: jest.fn(async (id: string, key: string | null) => { orden.push(`llave:${key}`); return { id } as Cart; }),
      applyKitchenRound: jest.fn(async (id: string) => { orden.push('aplicar'); return { id } as Cart; }),
    },
    enviarRonda: jest.fn(async () => { orden.push('enviar'); return r; }),
    encolarImpresion: jest.fn(async () => { orden.push('imprimir'); return { enqueued: 1, skippedStations: [] }; }),
    nombreCajero: jest.fn(async () => 'Laura'),
    nuevaLlave: jest.fn(() => 'llave-1'),
    actualizarCarrito: jest.fn(),
    t,
    avisar: { info: jest.fn((m: string) => orden.push(`info:${m}`)), success: jest.fn((m: string) => orden.push(`ok:${m}`)) },
    nombreNegocio: 'Negocio de prueba',
    ...extra,
  };
  return { d, orden };
}

describe('enviar a cocina (L58)', () => {
  it('sin líneas de preparación y sin comanda previa: avisa y no envía nada', async () => {
    const { d, orden } = deps();
    await enviarACocina(cart([item('a', sinPrep)]), d);
    expect(orden).toEqual(['info:sinPreparacion']);
  });

  it('solo van las líneas de preparación, con su estación; la llave se guarda ANTES de enviar', async () => {
    const { d, orden } = deps();
    await enviarACocina(cart([item('a', sinPrep), item('b', [conPrep]), item('c', conPrep, { station: 'cold_kitchen' })]), d);
    expect(orden).toEqual(['llave:llave-1', 'enviar', 'aplicar', 'imprimir', 'ok:enviado {"nuevas":2,"ajustes":0}']);
    const peticion = (d.enviarRonda as jest.Mock).mock.calls[0][0];
    expect(peticion).toMatchObject({ cart_id: 'cart-1', branch_id: 7, round_key: 'llave-1', server_name: 'Laura', legacy_ticket_id: null });
    expect(peticion.lines.map((l: { line_id: string; station: string }) => `${l.line_id}:${l.station}`)).toEqual(['b:hot_kitchen', 'c:cold_kitchen']);
  });

  it('reintento: reutiliza la llave guardada (no pide otra); sin nombre de cajero va «POS»; con comanda previa la ronda va aunque no queden líneas', async () => {
    const { d } = deps(respuesta([]), { nombreCajero: jest.fn(async () => { throw new Error('sin sesión'); }) });
    await enviarACocina(cart([], { kitchen_round_key: 'llave-vieja', kitchen_ticket_id: 55 }), d);
    expect(d.nuevaLlave).not.toHaveBeenCalled();
    expect(d.servicio.setCartKitchenRoundKey).not.toHaveBeenCalled();
    expect((d.enviarRonda as jest.Mock).mock.calls[0][0]).toMatchObject({ round_key: 'llave-vieja', server_name: 'POS', legacy_ticket_id: 55, lines: [] });
    expect(d.avisar.info).toHaveBeenCalledWith('sinCambios');
  });

  it('error de la ruta: sale con el texto traducido de su código (o el genérico) y no se aplica la ronda', async () => {
    const conocido = deps(undefined, { enviarRonda: jest.fn(async () => { throw new CocinaError('sin_permiso', 403); }) });
    await expect(enviarACocina(cart([item('a', conPrep)]), conocido.d)).rejects.toThrow('errores.sin_permiso');
    expect(conocido.d.servicio.applyKitchenRound).not.toHaveBeenCalled();
    const raro = deps(undefined, { enviarRonda: jest.fn(async () => { throw new CocinaError('otra_cosa', 500); }) });
    await expect(enviarACocina(cart([item('a', conPrep)]), raro.d)).rejects.toThrow('errores.error_interno');
    const red = deps(undefined, { enviarRonda: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    await expect(enviarACocina(cart([item('a', conPrep)]), red.d)).rejects.toThrow('errores.error_interno');
  });

  it('ronda repetida (ya había entrado): avisa «ya enviada» y NO reimprime', async () => {
    const { d, orden } = deps(respuesta([ticket(900, 'order', 1)], true));
    await enviarACocina(cart([item('a', conPrep)]), d);
    expect(orden).toEqual(['llave:llave-1', 'enviar', 'aplicar', 'info:yaEnviada']);
  });

  it('imprime cada comanda (el ajuste con su título) y avisa «sin impresora» si ninguna estación la tiene', async () => {
    const { d } = deps(respuesta([ticket(900, 'order', 2), ticket(901, 'adjustment', 1, 800)]), {
      encolarImpresion: jest.fn(async () => ({ enqueued: 0, skippedStations: ['hot_kitchen'] })),
    });
    await enviarACocina(cart([item('a', conPrep)]), d);
    const llamadas = (d.encolarImpresion as jest.Mock).mock.calls;
    expect(llamadas.map((c) => [c[0], c[1].ticketId, c[1].tableName, c[1].serverName, c[1].businessName])).toEqual([
      [7, 900, 'POS', 'Laura', 'Negocio de prueba'],
      [7, 901, 'POS · impreso.ajuste {"id":800}', 'Laura', 'Negocio de prueba'],
    ]);
    expect(d.avisar.info).toHaveBeenCalledWith('sinImpresora {"estaciones":"hot_kitchen"}');
    expect(d.avisar.success).not.toHaveBeenCalled();
  });
});

// ============================================================
// Renovación automática de membresías (docs/design/MEMBRESIAS-FASE-1-2.md §12.1).
//
// «Automática» deja una renovación PENDIENTE (evento renewal_due) 7 días antes del vencimiento;
// nunca cobra ni factura. La base es la fuente de verdad (fn_membresias_generar_renovaciones);
// `renovacion.ts` es su espejo para la interfaz. Aquí: cuándo se genera, idempotencia de la
// generación simulada, la pendiente vigente y que la ventana de la migración y la del código
// sean la misma.
// ============================================================
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DIAS_AVISO_RENOVACION,
  claveRenovacion,
  debeGenerarRenovacion,
  renovacionPendiente,
  simularGeneracion,
  type MembresiaParaRenovar,
} from '@/lib/services/membresias/renovacion';
import { membresiaDesdeServidor, membresiaFormInicial, payloadMembresia } from '@/components/inventario/productos/logica/membresiaProducto';

const AHORA = new Date('2026-10-01T15:00:00Z');
const DIA = 86_400_000;
const en = (dias: number) => new Date(AHORA.getTime() + dias * DIA).toISOString();

function m(extra: Partial<MembresiaParaRenovar> = {}): MembresiaParaRenovar {
  return { id: 1, status: 'active', end_date: en(3), grace_until: null, cancel_reason: null, renewal_mode: 'automatic', product_id: 96918, ...extra };
}

describe('cuándo se genera la renovación pendiente', () => {
  it('plan automático, activa, vence en 3 días: sí', () => {
    expect(debeGenerarRenovacion(m(), AHORA)).toBe(true);
  });

  it('justo en el borde de la ventana (7 días) sí; un segundo después no', () => {
    expect(debeGenerarRenovacion(m({ end_date: en(DIAS_AVISO_RENOVACION) }), AHORA)).toBe(true);
    const fuera = new Date(AHORA.getTime() + DIAS_AVISO_RENOVACION * DIA + 1000).toISOString();
    expect(debeGenerarRenovacion(m({ end_date: fuera }), AHORA)).toBe(false);
  });

  it('plan manual: nunca', () => {
    expect(debeGenerarRenovacion(m({ renewal_mode: 'manual' }), AHORA)).toBe(false);
  });

  it('plan sin producto: no hay nada que vender', () => {
    expect(debeGenerarRenovacion(m({ product_id: null }), AHORA)).toBe(false);
  });

  it('congelada, pendiente de pago, vencida o cancelada: no', () => {
    for (const status of ['frozen', 'pending', 'expired', 'cancelled']) {
      expect(debeGenerarRenovacion(m({ status }), AHORA)).toBe(false);
    }
  });

  it('en gracia (past_due con gracia vigente): sí; gracia agotada: no', () => {
    expect(debeGenerarRenovacion(m({ status: 'past_due', end_date: en(-1), grace_until: en(2) }), AHORA)).toBe(true);
    expect(debeGenerarRenovacion(m({ status: 'past_due', end_date: en(-5), grace_until: en(-1) }), AHORA)).toBe(false);
  });

  it('la fila que se aplicó como renovación de otra (renovacion_aplicada): no', () => {
    expect(debeGenerarRenovacion(m({ cancel_reason: 'renovacion_aplicada' }), AHORA)).toBe(false);
  });
});

describe('idempotencia de la generación (índice único membresía + periodo)', () => {
  it('dos pasadas seguidas: la segunda no genera nada', () => {
    const lista = [m({ id: 1 }), m({ id: 2, end_date: en(6) }), m({ id: 3, renewal_mode: 'manual' })];
    const primera = simularGeneracion(lista, [], AHORA);
    expect(primera.nuevos.map((e) => e.membership_id)).toEqual([1, 2]);
    const segunda = simularGeneracion(lista, primera.eventos, AHORA);
    expect(segunda.nuevos).toEqual([]);
    expect(segunda.eventos).toHaveLength(2);
  });

  it('cada hora durante la ventana: un solo evento por periodo', () => {
    const lista = [m({ end_date: en(7) })];
    let eventos = simularGeneracion(lista, [], AHORA).eventos;
    for (let h = 1; h <= 24 * 7; h += 1) {
      eventos = simularGeneracion(lista, eventos, new Date(AHORA.getTime() + h * 3_600_000)).eventos;
    }
    expect(eventos).toHaveLength(1);
  });

  it('renovada (vencimiento nuevo): el periodo nuevo tiene su propia pendiente', () => {
    const antes = simularGeneracion([m({ end_date: en(2) })], [], AHORA);
    const renovada = m({ end_date: en(2 + 30) });
    const despues = simularGeneracion([renovada], antes.eventos, new Date(AHORA.getTime() + 27 * DIA));
    expect(despues.nuevos).toHaveLength(1);
    expect(despues.nuevos[0].metadata.periodo_hasta_epoch).not.toBe(antes.nuevos[0].metadata.periodo_hasta_epoch);
  });

  it('la clave es el vencimiento en segundos enteros, como floor(extract(epoch …)) de la base', () => {
    // PostgREST devuelve microsegundos; la clave los descarta igual que la base.
    expect(claveRenovacion('2026-10-02T21:12:04.529495+00:00')).toBe('1790975524');
    expect(claveRenovacion('2026-10-02T21:12:04Z')).toBe('1790975524');
    expect(claveRenovacion('no-es-fecha')).toBe('');
  });
});

describe('renovación pendiente vigente (detalle y filtro del listado)', () => {
  const evento = (hasta: string, precio: number | null = 295000) => ({
    tipo: 'renewal_due',
    fecha: '2026-09-28T10:07:00Z',
    metadata: { periodo_hasta: hasta, periodo_hasta_epoch: claveRenovacion(hasta), precio },
  });

  it('la del periodo actual aparece con su precio', () => {
    const hasta = en(3);
    expect(renovacionPendiente({ estado: 'active', hasta }, [evento(hasta)])).toEqual({
      generada: '2026-09-28T10:07:00Z',
      periodoHasta: hasta,
      precio: 295000,
    });
  });

  it('ya renovada (el vencimiento cambió): no hay pendiente', () => {
    expect(renovacionPendiente({ estado: 'active', hasta: en(33) }, [evento(en(3))])).toBeNull();
  });

  it('vencida sin pagar: la pendiente sigue (cobrarla reactiva la misma membresía)', () => {
    const hasta = en(-2);
    expect(renovacionPendiente({ estado: 'expired', hasta }, [evento(hasta, null)])?.precio).toBeNull();
  });

  it('cancelada o congelada: no', () => {
    const hasta = en(3);
    expect(renovacionPendiente({ estado: 'cancelled', hasta }, [evento(hasta)])).toBeNull();
    expect(renovacionPendiente({ estado: 'frozen', hasta }, [evento(hasta)])).toBeNull();
  });
});

describe('formulario del producto: «Renovación automática» se guarda', () => {
  it('ida y vuelta: automatic llega al payload de fn_producto_guardar y vuelve del servidor', () => {
    const form = { ...membresiaFormInicial(), renewal_mode: 'automatic' as const };
    expect(payloadMembresia(form).renewal_mode).toBe('automatic');
    expect(membresiaDesdeServidor({ plan_id: 1, renewal_mode: 'automatic' } as Parameters<typeof membresiaDesdeServidor>[0]).renewal_mode).toBe('automatic');
  });

  it('por defecto y ante valores desconocidos: manual', () => {
    expect(membresiaFormInicial().renewal_mode).toBe('manual');
    expect(membresiaDesdeServidor({ plan_id: 1, renewal_mode: 'otra' } as Parameters<typeof membresiaDesdeServidor>[0]).renewal_mode).toBe('manual');
  });
});

describe('contrato con la migración', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260929235400_membresias_renovacion_automatica.sql'),
    'utf8',
  );

  it(`la ventana de la base es DIAS_AVISO_RENOVACION (${DIAS_AVISO_RENOVACION} días)`, () => {
    expect(sql).toContain(`m.end_date <= now() + interval '${DIAS_AVISO_RENOVACION} days'`);
    expect(sql).toContain(`'dias_aviso', ${DIAS_AVISO_RENOVACION}`);
  });

  it('la clave del periodo y el índice único son los que usa el código', () => {
    expect(sql).toContain("floor(extract(epoch from v_r.end_date))::bigint::text");
    expect(sql).toMatch(/create unique index if not exists membership_events_renewal_due_uq[\s\S]+periodo_hasta_epoch[\s\S]+where event_type = 'renewal_due'/);
  });

  it('no mueve dinero ni crea documentos: ni ventas, ni facturas, ni pagos, ni pasarelas', () => {
    const cuerpo = sql.slice(sql.indexOf('create or replace function public.fn_membresias_generar_renovaciones'));
    const funcion = cuerpo.slice(0, cuerpo.indexOf('$function$;'));
    expect(funcion).not.toMatch(/insert into public\.(sales|sale_items|invoice_sales|invoice_items|payments|accounts_receivable)/);
    expect(funcion).not.toMatch(/fn_factura_venta_|fn_registrar_pago|pos_checkout|fn_membresias_activar_venta/);
  });

  it('la generación no se puede llamar desde el navegador (sin grant a authenticated)', () => {
    expect(sql).toContain('revoke all on function public.fn_membresias_generar_renovaciones(integer) from public, anon, authenticated;');
  });
});

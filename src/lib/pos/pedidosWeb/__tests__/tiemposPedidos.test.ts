/**
 * Tiempos de los pedidos online (`tiemposPedidos.ts`): fábrica = lo de hoy, lector tolerante,
 * resolución sede → tipo → general → fábrica, minutos, apertura de la sede y confirmación
 * automática. Corre igual con TZ=UTC y TZ=America/Bogota (las zonas son explícitas).
 */
import {
  aMinutos,
  aTiempoDialogo,
  normalizarAjustesTiempos,
  proximaApertura,
  resolverTiempos,
  sedeTienePropios,
  tiemposConfirmacionAutomatica,
  tiemposDeFabrica,
  tipoDeEntrega,
  verticalDeTipo,
  type AjustesTiemposPedidos,
} from '../tiemposPedidos';
import { ajustesDesde, borradorDesde, tiposDistintos } from '@/components/pos/pedidos-online/tiempos/borradorTiempos';

const TIPOS_ENTREGA = ['delivery_own', 'delivery_third_party', 'pickup', 'dine_in', null] as const;
const TIPOS_ORGANIZACION = [1, 2, 3, 4, null, undefined] as const;

/**
 * COPIA LITERAL de lo que hace hoy `src/app/app/pos/pedidos-online/page.tsx` (y el detalle,
 * `useWebOrderDetail.ts`) al abrir «Confirmar»: si esto cambia allí, esta prueba debe cambiar.
 */
function dialogoDeHoy(typeId: number | null | undefined) {
  const orgTypeId = typeId ?? 3;
  const isRetail = orgTypeId === 3;
  const prepTime = isRetail ? { value: 1, unit: 'days' } : { value: 30, unit: 'minutes' };
  const transitTime = isRetail ? { value: 5, unit: 'days' } : { value: 30, unit: 'minutes' };
  return { prepTime, transitTime };
}

const CONFIG: AjustesTiemposPedidos = {
  por_tipo: {
    domicilio: { alistar: { valor: 1, unidad: 'horas' }, entrega: { valor: 40, unidad: 'minutos' } },
    transportadora: { alistar: { valor: 2, unidad: 'dias' }, entrega: { valor: 3, unidad: 'dias' } },
    recoger: { alistar: { valor: 20, unidad: 'minutos' } },
  },
  por_sede: {
    '7': { domicilio: { alistar: { valor: 2, unidad: 'horas' }, entrega: { valor: 45, unidad: 'minutos' } }, recoger: { alistar: { valor: 2, unidad: 'horas' } } },
  },
  usar_en_confirmacion_automatica: true,
  contar_desde_apertura: false,
};

describe('valores de fábrica = los de hoy', () => {
  test.each(TIPOS_ORGANIZACION)('sin configuración, type_id %p: el diálogo arranca igual que hoy', (typeId) => {
    const hoy = dialogoDeHoy(typeId);
    for (const deliveryType of TIPOS_ENTREGA) {
      const r = resolverTiempos(null, { sedeId: 7, deliveryType, vertical: verticalDeTipo(typeId) });
      expect(aTiempoDialogo(r.alistar)).toEqual(hoy.prepTime);
      if (r.entrega) expect(aTiempoDialogo(r.entrega)).toEqual(hoy.transitTime);
      expect(r.origen).toBe('fabrica');
    }
    // Domicilio y transportadora: el traslado de hoy.
    const dom = resolverTiempos(null, { deliveryType: 'delivery_own', vertical: verticalDeTipo(typeId) });
    expect(aTiempoDialogo(dom.entrega!)).toEqual(hoy.transitTime);
  });

  test('una fila vacía o basura resuelve igual que sin fila', () => {
    for (const basura of [{}, null, 'x', [], { por_tipo: 'no', por_sede: 3 }]) {
      const a = normalizarAjustesTiempos(basura);
      for (const deliveryType of TIPOS_ENTREGA) {
        for (const vertical of ['comercio', 'restaurante'] as const) {
          expect(resolverTiempos(a, { sedeId: 7, deliveryType, vertical })).toEqual(resolverTiempos(null, { sedeId: 7, deliveryType, vertical }));
        }
      }
    }
  });

  test('comercio 1 día / 5 días; restaurante 30 min / 30 min; recoger sin entrega', () => {
    expect(tiemposDeFabrica('comercio')).toEqual({
      domicilio: { alistar: { valor: 1, unidad: 'dias' }, entrega: { valor: 5, unidad: 'dias' } },
      transportadora: { alistar: { valor: 1, unidad: 'dias' }, entrega: { valor: 5, unidad: 'dias' } },
      recoger: { alistar: { valor: 1, unidad: 'dias' }, entrega: null },
    });
    expect(tiemposDeFabrica('restaurante').domicilio).toEqual({ alistar: { valor: 30, unidad: 'minutos' }, entrega: { valor: 30, unidad: 'minutos' } });
    expect(verticalDeTipo(null)).toBe('comercio');
    expect(verticalDeTipo(1)).toBe('restaurante');
  });

  test('sin «usar al confirmarse solo», la confirmación automática no sale de aquí', () => {
    const ajustes = { ...CONFIG, usar_en_confirmacion_automatica: false };
    expect(
      tiemposConfirmacionAutomatica({ ajustes, sedeId: 7, deliveryType: 'delivery_own', vertical: 'comercio', ahora: new Date('2026-11-24T15:00:00Z') }),
    ).toBeNull();
  });
});

describe('resolución sede → tipo → general → fábrica', () => {
  test('con fila: los generales por tipo', () => {
    const r = resolverTiempos(CONFIG, { sedeId: 99, deliveryType: 'delivery_own', vertical: 'comercio' });
    expect(r).toEqual({ tipo: 'domicilio', alistar: { valor: 1, unidad: 'horas' }, entrega: { valor: 40, unidad: 'minutos' }, origen: 'general' });
    expect(resolverTiempos(CONFIG, { deliveryType: 'delivery_third_party', vertical: 'comercio' }).entrega).toEqual({ valor: 3, unidad: 'dias' });
    expect(resolverTiempos(CONFIG, { deliveryType: 'dine_in', vertical: 'restaurante' })).toEqual({ tipo: 'recoger', alistar: { valor: 20, unidad: 'minutos' }, entrega: null, origen: 'general' });
  });

  test('por sede: manda la sede; lo que no tiene, de los generales', () => {
    expect(resolverTiempos(CONFIG, { sedeId: 7, deliveryType: 'delivery_own', vertical: 'comercio' })).toEqual({
      tipo: 'domicilio',
      alistar: { valor: 2, unidad: 'horas' },
      entrega: { valor: 45, unidad: 'minutos' },
      origen: 'sede',
    });
    // La sede 7 no personalizó transportadora: generales.
    expect(resolverTiempos(CONFIG, { sedeId: '7', deliveryType: 'delivery_third_party', vertical: 'comercio' }).origen).toBe('general');
    expect(sedeTienePropios(CONFIG, 7)).toBe(true);
    expect(sedeTienePropios(CONFIG, 8)).toBe(false);
  });

  test('tipo parcial: el campo que falta sube al siguiente nivel', () => {
    const a = normalizarAjustesTiempos({ por_tipo: { domicilio: { entrega: { valor: 2, unidad: 'horas' } } } });
    const r = resolverTiempos(a, { deliveryType: 'delivery_own', vertical: 'restaurante' });
    expect(r.alistar).toEqual({ valor: 30, unidad: 'minutos' });
    expect(r.entrega).toEqual({ valor: 2, unidad: 'horas' });
  });

  test('tipo de entrega', () => {
    expect(tipoDeEntrega('delivery_own')).toBe('domicilio');
    expect(tipoDeEntrega('delivery_third_party')).toBe('transportadora');
    expect(tipoDeEntrega('pickup')).toBe('recoger');
    expect(tipoDeEntrega('dine_in')).toBe('recoger');
    expect(tipoDeEntrega(undefined)).toBe('recoger');
  });
});

describe('lector tolerante', () => {
  test('descarta lo inválido y rescata lo válido', () => {
    const a = normalizarAjustesTiempos({
      por_tipo: {
        domicilio: { alistar: { valor: '45', unidad: 'minutes' }, entrega: { valor: -3, unidad: 'horas' } },
        transportadora: { alistar: { valor: 0, unidad: 'dias' }, entrega: { valor: 2, unidad: 'semanas' } },
        recoger: { alistar: { valor: 2.4, unidad: 'HORAS' }, entrega: { valor: 9, unidad: 'dias' } },
        otro: { alistar: { valor: 1, unidad: 'dias' } },
      },
      por_sede: { abc: { domicilio: { alistar: { valor: 1, unidad: 'dias' } } }, '-1': {}, '12': { recoger: { alistar: { valor: 1000, unidad: 'dias' } } }, '13': { recoger: { alistar: { valor: 5, unidad: 'minutos' } } } },
      usar_en_confirmacion_automatica: 'true',
      contar_desde_apertura: true,
    });
    expect(a).toEqual({
      por_tipo: {
        domicilio: { alistar: { valor: 45, unidad: 'minutos' } },
        recoger: { alistar: { valor: 2, unidad: 'horas' } },
      },
      por_sede: { '13': { recoger: { alistar: { valor: 5, unidad: 'minutos' } } } },
      usar_en_confirmacion_automatica: false,
      contar_desde_apertura: true,
    });
  });

  test('minutos', () => {
    expect(aMinutos({ valor: 30, unidad: 'minutos' })).toBe(30);
    expect(aMinutos({ valor: 2, unidad: 'horas' })).toBe(120);
    expect(aMinutos({ valor: 1, unidad: 'dias' })).toBe(1440);
  });
});

describe('borrador de la pestaña', () => {
  test('sin fila muestra la fábrica; guardar y volver a leer da lo mismo', () => {
    const b = borradorDesde(null, 'comercio');
    expect(b.por_tipo).toEqual(tiemposDeFabrica('comercio'));
    expect(b.usar_en_confirmacion_automatica).toBe(false);
    const leido = normalizarAjustesTiempos(JSON.parse(JSON.stringify(ajustesDesde(b))));
    expect(borradorDesde(leido, 'comercio')).toEqual(b);
  });

  test('una sede con propios guarda su juego completo y se resume por lo que difiere', () => {
    const b = borradorDesde(CONFIG, 'comercio');
    expect(Object.keys(b.por_sede)).toEqual(['7']);
    expect(tiposDistintos(b.por_sede['7'], b.por_tipo)).toEqual(['domicilio', 'recoger']);
    expect(normalizarAjustesTiempos(ajustesDesde(b)).por_sede['7'].transportadora).toEqual(CONFIG.por_tipo.transportadora);
  });
});

describe('contar desde la apertura', () => {
  const ZONA = 'America/Bogota';
  // Lunes a domingo 08:00–20:00 (no es el horario por defecto del formulario).
  const HORARIO = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { open: '08:00', close: '20:00', closed: false }]));

  test('cerrada a las 11:00 p. m.: la próxima apertura es mañana a las 8:00 (hora de la sede)', () => {
    // 2026-11-23T04:00Z = domingo 22 nov, 23:00 en Bogotá.
    const r = proximaApertura(HORARIO, ZONA, new Date('2026-11-23T04:00:00Z'));
    expect(r?.toISOString()).toBe('2026-11-23T13:00:00.000Z');
  });

  test('cerrada de madrugada: abre hoy', () => {
    // 2026-11-24T10:00Z = martes 24, 05:00 en Bogotá.
    expect(proximaApertura(HORARIO, ZONA, new Date('2026-11-24T10:00:00Z'))?.toISOString()).toBe('2026-11-24T13:00:00.000Z');
  });

  test('abierta, sin horario, horario por defecto sin revisar o basura: null (se cuenta desde ahora)', () => {
    const abierta = new Date('2026-11-24T15:00:00Z'); // 10:00 en Bogotá
    expect(proximaApertura(HORARIO, ZONA, abierta)).toBeNull();
    expect(proximaApertura(null, ZONA, abierta)).toBeNull();
    expect(proximaApertura('lunes a viernes', ZONA, abierta)).toBeNull();
    const porDefecto = {
      monday: { open: '09:00', close: '18:00', closed: false },
      tuesday: { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday: { open: '09:00', close: '18:00', closed: false },
      friday: { open: '09:00', close: '18:00', closed: false },
      saturday: { open: '10:00', close: '15:00', closed: false },
      sunday: { closed: true },
    };
    expect(proximaApertura(porDefecto, ZONA, new Date('2026-11-23T04:00:00Z'))).toBeNull();
  });

  test('turno que cruza la medianoche: a la 1:00 a. m. sigue abierta', () => {
    const nocturno = { ...HORARIO, sunday: { open: '18:00', close: '02:00', closed: false } };
    // 2026-11-23T06:00Z = lunes 23, 01:00 en Bogotá (el turno del domingo sigue).
    expect(proximaApertura(nocturno, ZONA, new Date('2026-11-23T06:00:00Z'))).toBeNull();
  });
});

describe('confirmación automática con la configuración encendida', () => {
  const ahora = new Date('2026-11-24T15:00:00Z');

  test('domicilio de la sede: listo = ahora + alistar; entrega = listo + entrega', () => {
    const r = tiemposConfirmacionAutomatica({ ajustes: CONFIG, sedeId: 7, deliveryType: 'delivery_own', vertical: 'comercio', ahora })!;
    expect(r.prepMin).toBe(120);
    expect(r.estimatedReadyAt.toISOString()).toBe('2026-11-24T17:00:00.000Z');
    expect(r.estimatedDeliveryAt?.toISOString()).toBe('2026-11-24T17:45:00.000Z');
  });

  test('transportadora: si la tarifa trae días de tránsito, manda la tarifa', () => {
    const conTarifa = tiemposConfirmacionAutomatica({ ajustes: CONFIG, sedeId: 7, deliveryType: 'delivery_third_party', vertical: 'comercio', ahora, diasTransitoTarifa: 4 })!;
    expect(conTarifa.entregaDeTarifa).toBe(true);
    expect(conTarifa.estimatedDeliveryAt?.toISOString()).toBe('2026-11-30T15:00:00.000Z'); // 2 días + 4 días
    const sinTarifa = tiemposConfirmacionAutomatica({ ajustes: CONFIG, sedeId: 7, deliveryType: 'delivery_third_party', vertical: 'comercio', ahora, diasTransitoTarifa: null })!;
    expect(sinTarifa.estimatedDeliveryAt?.toISOString()).toBe('2026-11-29T15:00:00.000Z'); // 2 días + 3 días
  });

  test('recoger: sin entrega', () => {
    const r = tiemposConfirmacionAutomatica({ ajustes: CONFIG, sedeId: 1, deliveryType: 'pickup', vertical: 'comercio', ahora })!;
    expect(r.prepMin).toBe(20);
    expect(r.estimatedDeliveryAt).toBeNull();
  });

  test('contar desde la apertura solo con el interruptor y un horario legible', () => {
    const HORARIO = { monday: { open: '08:00', close: '20:00', closed: false } };
    const noche = new Date('2026-11-23T04:00:00Z'); // domingo 23:00 en Bogotá
    const ajustes = { ...CONFIG, contar_desde_apertura: true };
    const r = tiemposConfirmacionAutomatica({ ajustes, sedeId: 1, deliveryType: 'pickup', vertical: 'comercio', ahora: noche, horarioSede: HORARIO, zonaSede: 'America/Bogota' })!;
    expect(r.inicio.toISOString()).toBe('2026-11-23T13:00:00.000Z');
    expect(r.estimatedReadyAt.toISOString()).toBe('2026-11-23T13:20:00.000Z');
    const sinHorario = tiemposConfirmacionAutomatica({ ajustes, sedeId: 1, deliveryType: 'pickup', vertical: 'comercio', ahora: noche, horarioSede: null, zonaSede: 'America/Bogota' })!;
    expect(sinHorario.inicio).toEqual(noche);
    const apagado = tiemposConfirmacionAutomatica({ ajustes: CONFIG, sedeId: 1, deliveryType: 'pickup', vertical: 'comercio', ahora: noche, horarioSede: HORARIO, zonaSede: 'America/Bogota' })!;
    expect(apagado.inicio).toEqual(noche);
  });
});

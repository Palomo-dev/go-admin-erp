/** @jest-environment jsdom */
/**
 * Aviso de la zona bajo la dirección (POS y pedido manual, Figma 2830:73378 y 2830:74984) en los
 * cuatro idiomas, y el aviso «X de N productos tienen peso» (cuenta pura).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { AvisoCotizacionDomicilio } from '../AvisoCotizacionDomicilio';
import { coberturaPeso } from '@/components/logistica/peso/AvisoPesoProductos';
import type { CotizacionEnvio } from '@/lib/logistica/cotizacion';

const IDIOMAS = { es, en, fr, pt } as const;
function pintar(ui: ReactElement, locale: keyof typeof IDIOMAS = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}
const fmt = (n: number) => `$ ${n.toLocaleString('es-CO')}`;

const enZona: CotizacionEnvio = {
  en_zona: true,
  zona: { id: 'z2', nombre: 'Zona 2 · Chapinero', es_tarifa_general: false, coincidencia: 'neighborhood' },
  precio: 7000,
  tarifa: 7000,
  moneda: 'COP',
  envio_gratis: false,
  envio_gratis_desde: null,
  falta_para_envio_gratis: null,
  pedido_minimo: 30000,
  cumple_minimo: true,
  falta_para_minimo: 0,
  tiempo: { min_minutos: 45, max_minutos: 60, texto: null },
  despacho: { fecha: '2026-11-23', hoy: true, corte: null, dias_reparto: [1, 2, 3, 4, 5, 6, 7], zona_horaria: 'America/Bogota' },
  modo: 'own',
  regla_id: null,
  motivo: null,
  alternativa: null,
  canal: 'pos',
  subtotal: 100000,
};
const fuera: CotizacionEnvio = { ...enZona, en_zona: false, zona: null, precio: 15000, motivo: 'fuera_de_zona', alternativa: 'tarifa_general' };

describe('AvisoCotizacionDomicilio', () => {
  it('en zona: «Zona 2 · Chapinero · $ 7.000 · 45–60 min» y el mínimo', () => {
    const errores = pintar(<AvisoCotizacionDomicilio estado="listo" cotizacion={enZona} formatear={fmt} />);
    expect(screen.getByText('Zona 2 · Chapinero · $ 7.000 · 45–60 min')).toBeTruthy();
    expect(screen.getByText(/Pedido mínimo \$ 30\.000/)).toBeTruthy();
    expect(errores).toEqual([]);
  });

  it('fuera de zona: cobrar la tarifa general o usar transportadora', () => {
    const cobrar = jest.fn();
    const transportadora = jest.fn();
    pintar(<AvisoCotizacionDomicilio estado="listo" cotizacion={fuera} formatear={fmt} onCobrarTarifaGeneral={cobrar} onUsarTransportadora={transportadora} />);
    expect(screen.getByText(/Fuera de zona/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar tarifa general $ 15.000' }));
    expect(cobrar).toHaveBeenCalledWith(15000);
    fireEvent.click(screen.getByRole('button', { name: 'Usar transportadora' }));
    expect(transportadora).toHaveBeenCalled();
  });

  it('sin zonas configuradas no pinta nada (el POS queda como antes)', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={es as unknown as Record<string, never>}>
        <AvisoCotizacionDomicilio estado="listo" cotizacion={{ ...enZona, motivo: 'sin_zonas_configuradas', en_zona: false, zona: null, precio: null }} formatear={fmt} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it.each(['en', 'fr', 'pt'] as const)('sin claves faltantes en %s', (locale) => {
    expect(pintar(<AvisoCotizacionDomicilio estado="listo" cotizacion={fuera} formatear={fmt} onCobrarTarifaGeneral={() => undefined} onUsarTransportadora={() => undefined} />, locale)).toEqual([]);
    expect(pintar(<AvisoCotizacionDomicilio estado="listo" cotizacion={{ ...enZona, cumple_minimo: false, falta_para_minimo: 5000 }} formatear={fmt} />, locale)).toEqual([]);
  });
});

describe('cobertura del peso', () => {
  it('cuenta el peso propio, el de la categoría y el de la organización', () => {
    const conteo = new Map<number | null, { productos: number; conPeso: number }>([
      [1, { productos: 10, conPeso: 0 }],
      [2, { productos: 5, conPeso: 2 }],
      [null, { productos: 3, conPeso: 0 }],
    ]);
    expect(coberturaPeso(conteo, new Set([1]), false)).toEqual({ total: 18, conPeso: 12 });
    expect(coberturaPeso(conteo, new Set(), true)).toEqual({ total: 18, conPeso: 18 });
  });
});

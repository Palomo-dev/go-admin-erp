/** @jest-environment jsdom */
/**
 * Pantallas centrales de Logística (Figma «21 Logística» y «22 Logística»):
 * - la insignia de estado pinta los 11 canónicos en los cuatro idiomas;
 * - la hoja «Asignar domiciliario» asigna SIN vehículo, por la RPC de siempre;
 * - todas las claves que usan Por despachar, el detalle y Seguimiento existen en es/en/fr/pt.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'COP', formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: () => '1:00 p. m.', getToday: () => '2026-11-23', timezone: 'America/Bogota' }),
}));

const assignVehicleAndDriver = jest.fn(async () => ({}));
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  },
  deliveryIntegrationService: {
    getAvailableDrivers: jest.fn(async () => [
      { id: 'd1', full_name: 'Luisa Martínez', phone: '300', is_active: true, vehicle_type: 'motorcycle', metadata: {} },
      { id: 'd2', full_name: 'Jhon Ramírez', phone: '301', is_active: true, vehicle_type: 'bicycle', metadata: { cobra_contraentrega: false } },
    ]),
    getAvailableVehicles: jest.fn(async () => []),
    assignVehicleAndDriver: (...a: unknown[]) => assignVehicleAndDriver(...(a as [])),
  },
}));
jest.mock('@/lib/services/logistica/despachoService', () => ({ enviosDeDomiciliarios: jest.fn(async () => []) }));

import { EstadoEnvioBadge } from '../EstadoEnvioBadge';
import { HojaAsignarDomiciliario } from '../asignar/HojaAsignarDomiciliario';
import { ESTADOS_CANONICOS } from '@/lib/logistica/estadosEnvio';
import type { FilaDespacho } from '@/lib/logistica/despacho';

const IDIOMAS = { es, en, fr, pt } as const;

// La hoja es lateral en escritorio (useEsEscritorio → matchMedia, que jsdom no trae).
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
type Idioma = keyof typeof IDIOMAS;

function pintar(ui: ReactElement, locale: Idioma = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}

function envio(p: Partial<FilaDespacho>): FilaDespacho {
  return {
    id: 'e1', numero: 'DEL-WO-1', status: 'pending', modo: 'own', branchId: 1, canal: 'web', pedido: 'WO-1', pedidoWebId: 'w1',
    creado: '2026-11-23T15:00:00Z', cliente: 'Ana', telefono: null, direccion: 'Cra 45 #12-30', ciudad: 'Bogotá', barrio: 'Chapinero',
    instrucciones: null, promesa: '2026-11-23T18:00:00Z', fechaEsperada: null, valor: 128900, moneda: null, contraentrega: 0, codStatus: null,
    pagado: true, domiciliarioId: null, domiciliario: null, vehiculoId: null, asignado: null, intentosFallidos: 0, motivoNovedad: null,
    codigoRequerido: false, ...p,
  };
}

describe('EstadoEnvioBadge', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: los 11 estados canónicos con texto propio', (idioma) => {
    const errores = pintar(
      <div>
        {ESTADOS_CANONICOS.map((e) => (
          <EstadoEnvioBadge key={e} estado={e} />
        ))}
        <EstadoEnvioBadge estado="pending" />
      </div>,
      idioma,
    );
    expect(errores).toEqual([]);
    const textos = Array.from(document.querySelectorAll('[data-estado]')).map((n) => n.textContent ?? '');
    expect(textos).toHaveLength(12);
    expect(textos.every((t) => t.length > 0 && !t.includes('.'))).toBe(true);
    // Un estado interno se pinta como su canónico.
    expect(document.querySelectorAll('[data-estado="created"]')).toHaveLength(2);
  });
});

describe('Asignar domiciliario (2800:8231)', () => {
  beforeEach(() => assignVehicleAndDriver.mockClear());

  test('asigna sin vehículo, en el orden sugerido de la ruta', async () => {
    const onAsignado = jest.fn();
    const errores = pintar(
      <HojaAsignarDomiciliario
        abierto
        onAbiertoChange={() => undefined}
        organizationId={7}
        envios={[envio({ id: 'b', numero: 'B', promesa: '2026-11-23T19:00:00Z' }), envio({ id: 'a', numero: 'A', promesa: '2026-11-23T18:00:00Z' })]}
        onAsignado={onAsignado}
      />,
    );
    await screen.findByText('Luisa Martínez');
    expect(screen.getAllByText('Asignar 2 envíos').length).toBeGreaterThan(0);
    expect(screen.getByText('Opcional')).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Asignar 2 envíos' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /Luisa Martínez/ }));
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);

    await waitFor(() => expect(onAsignado).toHaveBeenCalled());
    expect(assignVehicleAndDriver.mock.calls).toEqual([
      ['a', null, 'd1'],
      ['b', null, 'd1'],
    ]);
    expect(errores).toEqual([]);
  });

  test('quien no cobra contraentrega no se puede elegir para envíos contraentrega, con su motivo', async () => {
    pintar(
      <HojaAsignarDomiciliario abierto onAbiertoChange={() => undefined} organizationId={7} envios={[envio({ contraentrega: 45900, codStatus: 'pending' })]} />,
    );
    const jhon = (await screen.findByRole('radio', { name: /Jhon Ramírez/ })) as HTMLButtonElement;
    expect(jhon.disabled).toBe(true);
    expect(screen.getByText(/No cobra contraentrega/)).toBeTruthy();
  });

  test.each(['en', 'fr', 'pt'] as Idioma[])('%s: la hoja no tiene claves sin traducir', async (idioma) => {
    const errores = pintar(<HojaAsignarDomiciliario abierto onAbiertoChange={() => undefined} organizationId={7} envios={[envio({})]} />, idioma);
    await screen.findByText('Luisa Martínez');
    expect(errores).toEqual([]);
  });
});

describe('claves de las pantallas en los cuatro idiomas', () => {
  type Arbol = { [k: string]: string | Arbol };
  const plano = (a: Arbol, p = ''): Record<string, string> =>
    Object.entries(a).reduce<Record<string, string>>((acc, [k, v]) => (typeof v === 'string' ? { ...acc, [p + k]: v } : { ...acc, ...plano(v, `${p}${k}.`) }), {});
  const de = (l: Idioma) => plano(((IDIOMAS[l] as unknown as Arbol).logistica ?? {}) as Arbol);

  test.each(['en', 'fr', 'pt'] as Idioma[])('%s tiene las mismas claves de despacho, envío y seguimiento que es', (idioma) => {
    const mias = (k: string) => /^(menu|despacho|envio|seguimiento)\./.test(k);
    const es_ = Object.keys(de('es')).filter(mias).sort();
    const otro = Object.keys(de(idioma)).filter(mias).sort();
    expect({ faltan: es_.filter((k) => !otro.includes(k)), sobran: otro.filter((k) => !es_.includes(k)) }).toEqual({ faltan: [], sobran: [] });
  });

  // Cada archivo con el namespace de su `useTranslations` principal (`t`).
  const ARCHIVOS: [string, string][] = [
    ['porDespachar/PorDespacharPage.tsx', 'despacho'],
    ['asignar/HojaAsignarDomiciliario.tsx', 'despacho.asignar'],
    ['useImpresionLogistica.ts', 'despacho.impresion'],
    ['envio/DetalleEnvioPage.tsx', 'envio'],
    ['seguimiento/SeguimientoPage.tsx', 'seguimiento'],
  ];
  test.each(ARCHIVOS)('%s: toda clave literal de t(…) existe en es', (archivo, ns) => {
    const fuente = readFileSync(join(__dirname, '..', archivo), 'utf8');
    // Solo hasta el primer componente auxiliar (los que declaran su propio `t`).
    const cuerpo = fuente.split(/\nfunction [A-Z]/)[0];
    const claves = Array.from(cuerpo.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g), (m) => m[1]);
    const es_ = de('es');
    expect(claves.filter((k) => !(`${ns}.${k}` in es_))).toEqual([]);
  });
});

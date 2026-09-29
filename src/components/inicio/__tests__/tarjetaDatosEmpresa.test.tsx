/**
 * @jest-environment jsdom
 */
/**
 * Acceso v3, fase 7: tarjeta «Completa los datos de tu empresa» (Figma 1170:744210)
 * y la regla compartida con la activación de la facturación electrónica.
 */
let fila: Record<string, unknown> | null = null;
const consultas: number[] = [];
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_c: string, id: number) => ({
          maybeSingle: async () => {
            consultas.push(id);
            return { data: fila, error: null };
          },
        }),
      }),
    }),
  },
}));

import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { datosEmpresaFaltantes } from '@/lib/organizacion/datosEmpresa';
import { TarjetaDatosEmpresa } from '../TarjetaDatosEmpresa';

const ADMIN = { roleId: 2 };
const EMPLEADO = { roleId: 4 };

beforeEach(() => {
  fila = null;
  consultas.length = 0;
});

describe('datosEmpresaFaltantes', () => {
  test('nombra lo que falta en orden: NIT, ciudad, dirección', () => {
    expect(datosEmpresaFaltantes({ nit: null, tax_id: null, city: '', address: '  ' })).toEqual(['nit', 'ciudad', 'direccion']);
  });
  test('el NIT viejo en tax_id cuenta', () => {
    expect(datosEmpresaFaltantes({ nit: null, tax_id: '900123456', city: 'Cali', address: 'Cra 1' })).toEqual([]);
  });
  test('sin organización no inventa faltantes', () => {
    expect(datosEmpresaFaltantes(null)).toEqual([]);
  });
});

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('TarjetaDatosEmpresa (%s)', (idioma) => {
  it('a un admin con datos faltantes: título, qué falta y enlace a Organización › Información', async () => {
    fila = { nit: '900123456', tax_id: null, city: null, address: null };
    renderConIdioma(<TarjetaDatosEmpresa organizationId={7} permContext={ADMIN} />, { idioma });
    const enlace = await screen.findByRole('link');
    expect(enlace.getAttribute('href')).toBe('/app/organizacion/informacion');
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
  });
});

describe('TarjetaDatosEmpresa', () => {
  it('en español dice exactamente qué falta', async () => {
    fila = { nit: null, tax_id: null, city: null, address: null };
    renderConIdioma(<TarjetaDatosEmpresa organizationId={7} permContext={ADMIN} />, { idioma: 'es' });
    expect(await screen.findByText(/Faltan el NIT, la ciudad y la dirección\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Completar datos' })).toBeTruthy();
  });

  it('con los tres datos no se pinta', async () => {
    fila = { nit: '900123456', city: 'Medellín', address: 'Calle 10 # 5-20' };
    const { container } = renderConIdioma(<TarjetaDatosEmpresa organizationId={7} permContext={ADMIN} />, { idioma: 'es' });
    await waitFor(() => expect(consultas).toEqual([7]));
    expect(container.innerHTML).toBe('');
  });

  it('a quien no administra no se le muestra ni se consulta', async () => {
    fila = { nit: null, city: null, address: null };
    const { container } = renderConIdioma(<TarjetaDatosEmpresa organizationId={7} permContext={EMPLEADO} />, { idioma: 'es' });
    expect(container.innerHTML).toBe('');
    expect(consultas).toEqual([]);
  });
});

/**
 * @jest-environment jsdom
 *
 * `DocumentoCabecera` en móvil (< lg). La cabecera de escritorio va en
 * `hidden lg:flex`: todo lo que se pasa en `acciones` desaparece en el celular.
 * Fallo reportado por el dueño (2026-11-07): los detalles de factura de venta y
 * de compra no mostraban ninguna acción en móvil. Con `accionesMovil` el
 * documento publica «⋯» en el MobileHeader y pinta la fila de botones bajo el
 * estado, fuera de la cabecera oculta.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Ban, Printer } from 'lucide-react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import { DocumentoCabecera } from '../documento/DocumentoCabecera';

function MobileHeaderDePrueba() {
  const c = useCabeceraMovilActual();
  return <div data-prueba="mobile-header">{c?.accion}</div>;
}

const enCabeceraOculta = (el: HTMLElement) => el.closest('header')?.className.includes('hidden lg:flex') ?? false;

function montar(props: Partial<React.ComponentProps<typeof DocumentoCabecera>> = {}) {
  return renderConIdioma(
    <CabeceraMovilProvider>
      <MobileHeaderDePrueba />
      <DocumentoCabecera tipo="factura" titulo="Factura FV-42" estado="issued" acciones={<button type="button">Registrar pago</button>} {...props} />
    </CabeceraMovilProvider>,
  );
}

beforeEach(() => simularAncho(390));
afterAll(() => simularAncho(1440));

describe('DocumentoCabecera · acciones en móvil', () => {
  test('caracterización del fallo: sin `accionesMovil` la única acción vive en la cabecera oculta en móvil', () => {
    const { container } = montar();
    const botones = screen.getAllByRole('button', { name: 'Registrar pago' });
    expect(botones).toHaveLength(1);
    expect(enCabeceraOculta(botones[0])).toBe(true);
    expect(container.querySelector('[data-prueba="mobile-header"]')?.childElementCount).toBe(0);
  });

  test('con `accionesMovil`: fila visible en móvil (lg:hidden) y «⋯» en el MobileHeader con el menú', async () => {
    const anular = jest.fn();
    const { container } = montar({
      accionesMovil: {
        principales: <button type="button">Registrar pago</button>,
        menu: [
          { id: 'imprimir', etiqueta: 'Imprimir', icono: Printer, onSelect: jest.fn() },
          { id: 'oculta', etiqueta: 'No aplica', icono: Printer, onSelect: jest.fn(), oculta: true },
          { id: 'anular', etiqueta: 'Anular', icono: Ban, onSelect: anular, destructiva: true },
        ],
      },
    });
    const movil = screen.getAllByRole('button', { name: 'Registrar pago' }).find((b) => !enCabeceraOculta(b));
    expect(movil).toBeDefined();
    expect(movil!.closest('.lg\\:hidden')).not.toBeNull();

    const cabeceraMovil = container.querySelector('[data-prueba="mobile-header"]') as HTMLElement;
    const mas = cabeceraMovil.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(mas).not.toBeNull();
    fireEvent.click(mas);
    expect(screen.getByText('Imprimir')).toBeTruthy();
    expect(screen.queryByText('No aplica')).toBeNull();
    fireEvent.click(screen.getByText('Anular'));
    // La hoja ejecuta la acción tras cerrarse (setTimeout 0).
    await waitFor(() => expect(anular).toHaveBeenCalled());
  });

  test('el estado del documento también se ve en móvil (antes solo estaba en la cabecera oculta)', () => {
    montar({ accionesMovil: { menu: [] } });
    const estados = screen.getAllByText(/emitida/i);
    expect(estados.some((e) => !enCabeceraOculta(e))).toBe(true);
  });

  test('`movil={false}` (fuera del shell) no duplica nada', () => {
    montar({ movil: false, accionesMovil: { principales: <button type="button">Otra</button> } });
    expect(screen.queryByRole('button', { name: 'Otra' })).toBeNull();
  });
});

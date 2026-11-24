/**
 * @jest-environment jsdom
 *
 * El interruptor «Aviso de contraentrega» en el inspector de «Acciones de producto» (Figma
 * 3073:83567), con los textos reales de messages/*.json en los 4 idiomas, y el grupo de
 * Encabezado › Carrito debajo de «Envío gratis» (Figma 3071:82659).
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma as render, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { InspectorSeccion } from '../InspectorSeccion';
import { VistaCarrito } from '../CabeceraTiendaVistas';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

const seccion = {
  id: 'acciones-1',
  page_id: 'p',
  section_type: 'product_actions',
  section_variant: 'default',
  content: {},
  settings: {},
  sort_order: 3,
  is_visible: true,
} as unknown as WebsitePageSection;

const props = {
  seccion,
  enBorrador: true,
  onCambiarContenido: jest.fn(),
  onCambiarVariante: jest.fn(),
  onCambiarEstilo: jest.fn(),
  onCambiarVisibilidad: jest.fn(),
  onAlternarVisible: jest.fn(),
  onDuplicar: jest.fn(),
  onEliminar: jest.fn(),
  tema: { colores: {}, fuentes: [] } as never,
  catalogoFuentes: [],
  categorias: { lista: [], cargando: false },
};

describe('Acciones de producto › Aviso de contraentrega', () => {
  test('apagado por defecto; encenderlo escribe header_carrito.avisoContraentrega.ficha', () => {
    const onCambiarAjustes = jest.fn();
    render(
      <InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} onCambiarAjustes={onCambiarAjustes} />,
    );
    const interruptor = screen.getByRole('switch', { name: /Aviso de contraentrega/ });
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
    expect(onCambiarAjustes).not.toHaveBeenCalled();
    fireEvent.click(interruptor);
    expect(onCambiarAjustes).toHaveBeenLastCalledWith({ header_carrito: { avisoContraentrega: { ficha: true } } });
  });

  test('encendido (desde Encabezado › Carrito) se ve encendido aquí, con la línea de la tienda', () => {
    render(
      <InspectorSeccion
        {...props}
        entornoEspacio={{ primera: false, ajustesSitio: { header_carrito: { avisoContraentrega: { ficha: true } } } }}
        onCambiarAjustes={jest.fn()}
      />,
    );
    expect(screen.getByRole('switch', { name: /Aviso de contraentrega/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Contraentrega disponible · pagas al recibir')).toBeTruthy();
  });

  test('sin onCambiarAjustes no sale', () => {
    render(<InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} />);
    expect(screen.queryByRole('switch', { name: /Aviso de contraentrega/ })).toBeNull();
  });

  test.each<[IdiomaPrueba, RegExp]>([
    ['en', /Cash on delivery notice/],
    ['fr', /Avis de paiement à la livraison/],
    ['pt', /Aviso de pagamento na entrega/],
  ])('en %s el interruptor sale traducido', (idioma, nombre) => {
    render(<InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} onCambiarAjustes={jest.fn()} />, { idioma });
    expect(screen.getByRole('switch', { name: nombre })).toBeTruthy();
  });
});

describe('Encabezado › Carrito › Aviso de contraentrega', () => {
  test('el grupo va debajo de «Envío gratis», con las dos casillas apagadas', () => {
    render(<VistaCarrito ajustes={{}} cambiar={jest.fn()} enBorrador />);
    const envio = screen.getByText('Envío gratis');
    const grupo = document.querySelector('[data-grupo-aviso-contraentrega]');
    expect(grupo).toBeTruthy();
    expect(envio.compareDocumentPosition(grupo as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'En el carrito' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'En la ficha del producto' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('link', { name: /Condiciones en Ventas en línea/ })).toBeTruthy();
  });
});

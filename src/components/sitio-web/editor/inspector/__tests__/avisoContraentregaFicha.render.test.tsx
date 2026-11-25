/**
 * @jest-environment jsdom
 *
 * El interruptor «Mostrar aviso de contraentrega» en Ficha › Información del producto › Diseño,
 * junto a «Mostrar countdown» (Figma 3099:83909), con los textos reales de messages/*.json en los
 * 4 idiomas, y el interruptor de Encabezado › Carrito debajo de «Envío gratis» (Figma 3098:83737).
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
  id: 'info-1',
  page_id: 'p',
  section_type: 'product_info',
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

describe('Información del producto › Aviso de contraentrega', () => {
  test('apagado por defecto; encenderlo escribe header_carrito.avisoContraentrega.ficha', () => {
    const onCambiarAjustes = jest.fn();
    render(
      <InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} onCambiarAjustes={onCambiarAjustes} />,
    );
    const interruptor = screen.getByRole('switch', { name: /Mostrar aviso de contraentrega/ });
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
    expect(screen.getByRole('switch', { name: /Mostrar aviso de contraentrega/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Contraentrega disponible · pagas al recibir')).toBeTruthy();
  });

  test('sin onCambiarAjustes no sale', () => {
    render(<InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} />);
    expect(screen.queryByRole('switch', { name: /Mostrar aviso de contraentrega/ })).toBeNull();
  });

  test.each<[IdiomaPrueba, RegExp]>([
    ['en', /Show cash on delivery notice/],
    ['fr', /Afficher l’avis de paiement à la livraison/],
    ['pt', /Mostrar aviso de pagamento na entrega/],
  ])('en %s el interruptor sale traducido', (idioma, nombre) => {
    render(<InspectorSeccion {...props} entornoEspacio={{ primera: false, ajustesSitio: {} }} onCambiarAjustes={jest.fn()} />, { idioma });
    expect(screen.getByRole('switch', { name: nombre })).toBeTruthy();
  });
});

describe('Encabezado › Carrito › Aviso de contraentrega', () => {
  test('va debajo de «Envío gratis», con un solo interruptor apagado y sin casillas', () => {
    render(<VistaCarrito ajustes={{}} cambiar={jest.fn()} enBorrador />);
    const envio = screen.getByText('Envío gratis');
    const grupo = document.querySelector('[data-grupo-aviso-contraentrega]');
    expect(grupo).toBeTruthy();
    expect(envio.compareDocumentPosition(grupo as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Aviso de contraentrega en el carrito/ }).getAttribute('aria-checked')).toBe('false');
    expect((grupo as HTMLElement).querySelector('[role="checkbox"]')).toBeNull();
    expect(screen.getByRole('link', { name: /Condiciones en Ventas en línea/ })).toBeTruthy();
  });
});

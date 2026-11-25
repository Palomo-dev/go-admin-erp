/**
 * @jest-environment jsdom
 *
 * Clic en la fila de íconos del lienzo (Figma «16 Sitio web» B1 3265:99803): el inspector del
 * encabezado abre Encabezado › Íconos con «Orden en la cabecera» resaltado. Con los textos reales
 * (es), como los ve el dueño.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { shellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { InspectorEncabezado } from '../inspector/InspectorEncabezado';

jest.mock('../inspector/useDestinosTienda', () => ({ useDestinosTienda: () => null }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const SLUGS = ['home', 'contacto'];
const PLANTILLA = shellPorDefecto('noir_omakase', 'restaurante', SLUGS);

function encabezado(extra: Partial<React.ComponentProps<typeof InspectorEncabezado>> = {}) {
  const onCambiar = jest.fn();
  const props: React.ComponentProps<typeof InspectorEncabezado> = {
    ajustes: { header_style: 'default', header_menu_id: 'm1' },
    onCambiar,
    menus: [{ id: 'm1', name: 'Principal', enlaces: 6 }],
    paginas: SLUGS.map((s) => ({ slug: s, titulo: s })),
    porDefecto: PLANTILLA,
    enBorrador: true,
    dispositivo: 'escritorio',
    coloresTema: { fondo: '#FFFFFF', texto: '#111827', acento: '#3B4BDB' },
    onEditarMenu: jest.fn(),
    onCerrar: jest.fn(),
    ...extra,
  };
  const r = renderConIdioma(<InspectorEncabezado {...props} />);
  return { onCambiar, rerender: (p: Partial<typeof props>) => r.rerender(<InspectorEncabezado {...props} {...p} />) };
}

describe('Lienzo → «Orden en la cabecera»', () => {
  test('sin pedido del lienzo, el inspector abre como siempre (sin la vista Íconos)', () => {
    encabezado();
    expect(document.querySelector('[data-orden-cabecera]')).toBeNull();
  });

  test('montado por el clic en la fila de íconos: abre Íconos con el orden resaltado', () => {
    encabezado({ abrirOrdenIconos: 1 });
    const bloque = document.querySelector('[data-orden-cabecera]') as HTMLElement;
    expect(bloque).not.toBeNull();
    expect(bloque.hasAttribute('data-resaltado')).toBe(true);
    expect(within(bloque).getByText('Orden en la cabecera')).toBeTruthy();
    // Los textos reales en español: la lista, las flechas y «Restablecer orden».
    expect(within(bloque).getByRole('button', { name: 'Subir Carrito' })).toBeTruthy();
    expect(within(bloque).getByRole('button', { name: 'Restablecer orden' })).toBeTruthy();
  });

  test('un clic nuevo con el inspector abierto vuelve a la vista Íconos', () => {
    const { rerender } = encabezado();
    expect(document.querySelector('[data-orden-cabecera]')).toBeNull();
    rerender({ abrirOrdenIconos: 1 });
    expect(document.querySelector('[data-orden-cabecera]')).not.toBeNull();
    // «Volver» y otro clic: abre de nuevo.
    fireEvent.click(screen.getAllByRole('button', { name: /Volver/i })[0]);
    expect(document.querySelector('[data-orden-cabecera]')).toBeNull();
    rerender({ abrirOrdenIconos: 2 });
    expect(document.querySelector('[data-orden-cabecera]')).not.toBeNull();
  });
});

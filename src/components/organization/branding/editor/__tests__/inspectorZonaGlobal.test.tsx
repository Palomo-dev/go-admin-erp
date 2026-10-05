/**
 * @jest-environment jsdom
 *
 * Editor de páginas · encabezado y pie globales (Figma «16 Sitio web › 05
 * Editor»): filas fijas de la lista de secciones, inspector con pestañas
 * Diseño / Contenido / Estilo / Celular y hoja del constructor del menú.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import EditorSidebar from '../EditorSidebar';
import { HeaderInspector } from '../inspector/HeaderInspector';
import { FooterInspector } from '../inspector/FooterInspector';
import { HojaMenu } from '../inspector/HojaMenu';
import { esZonaGlobal, pestanaInicialZona } from '../inspector/zonaGlobal';

// Los constructores de menú leen la base al montar: aquí basta saber cuál monta.
jest.mock('../MenuGroupEditor', () => ({
  __esModule: true,
  default: ({ menuId }: { menuId: string }) => <div data-testid="menu-group-editor">{menuId}</div>,
}));
jest.mock('../MenuGroupManager', () => ({
  __esModule: true,
  default: () => <div data-testid="menu-group-manager" />,
}));
jest.mock('../MenuTreeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="menu-tree-editor" />,
}));

const SETTINGS = {
  id: 'ws-1',
  organization_id: 120,
  header_style: 'default',
  footer_style: 'default',
  show_topbar: false,
} as unknown as WebsiteSettings;

const SECCION: WebsitePageSection = {
  id: 'sec-1',
  page_id: 'pag-1',
  organization_id: 120,
  section_type: 'hero',
  section_variant: 'minimal',
  content: {},
  settings: {},
  sort_order: 0,
  is_visible: true,
  created_at: '',
  updated_at: '',
} as WebsitePageSection;

function renderSidebar(props: Partial<React.ComponentProps<typeof EditorSidebar>> = {}) {
  const onSelectZonaGlobal = jest.fn();
  renderConIdioma(
    <EditorSidebar
      sections={[SECCION]}
      activeSectionId={null}
      onSelectSection={jest.fn()}
      onUpdateSectionContent={jest.fn()}
      onUpdateSectionVariant={jest.fn()}
      onToggleVisibility={jest.fn()}
      onDeleteSection={jest.fn()}
      onAddSection={jest.fn()}
      onReorder={jest.fn()}
      showGlobalSettings={false}
      onToggleGlobalSettings={jest.fn()}
      showPageSEO={false}
      onTogglePageSEO={jest.fn()}
      onSelectZonaGlobal={onSelectZonaGlobal}
      {...props}
    />,
  );
  return { onSelectZonaGlobal };
}

describe('zonaGlobal (lógica)', () => {
  test('solo «header» y «footer» son zonas globales', () => {
    expect(esZonaGlobal('header')).toBe(true);
    expect(esZonaGlobal('footer')).toBe(true);
    expect(esZonaGlobal('sec-1')).toBe(false);
    expect(esZonaGlobal(null)).toBe(false);
  });

  test('con el lienzo en celular abre en «Celular»; si no, en «Diseño»', () => {
    expect(pestanaInicialZona('mobile')).toBe('celular');
    expect(pestanaInicialZona('desktop')).toBe('diseno');
    expect(pestanaInicialZona('tablet')).toBe('diseno');
  });
});

describe('EditorSidebar · filas fijas', () => {
  test('encabezado arriba y pie abajo, con candado y «Global», sin arrastre', () => {
    renderSidebar();
    const encabezado = screen.getByRole('button', { name: /Encabezado \(global\)/ });
    const pie = screen.getByRole('button', { name: /Pie de página \(global\)/ });
    const seccion = screen.getByRole('button', { name: /^Sección / });

    // Orden en el documento: encabezado → secciones → pie.
    expect(encabezado.compareDocumentPosition(seccion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(seccion.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const fila of [encabezado, pie]) {
      expect(within(fila).getByText('Global')).toBeTruthy();
      expect(fila.closest('[draggable="true"]')).toBeNull();
    }
  });

  test('ya no están los acordeones «Configuración del Menú» ni «Footer»', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Configuración del Menú' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Footer' })).toBeNull();
  });

  test('pulsar una fila fija selecciona su zona y la marca', () => {
    const { onSelectZonaGlobal } = renderSidebar({ zonaGlobalActiva: 'footer' });
    fireEvent.click(screen.getByRole('button', { name: /Encabezado \(global\)/ }));
    expect(onSelectZonaGlobal).toHaveBeenCalledWith('header');
    expect(screen.getByRole('button', { name: /Pie de página \(global\)/ }).getAttribute('aria-pressed')).toBe('true');
  });

  test('la búsqueda filtra secciones pero no las filas fijas', () => {
    renderSidebar({ sectionSearch: 'zzz', onSectionSearchChange: jest.fn() });
    expect(screen.queryByRole('button', { name: /^Sección / })).toBeNull();
    expect(screen.getByRole('button', { name: /Encabezado \(global\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pie de página \(global\)/ })).toBeTruthy();
  });
});

describe('HeaderInspector', () => {
  const base = {
    settings: SETTINGS,
    onUpdate: jest.fn(),
    availableMenus: [{ id: 'm-1', name: 'Principal' }],
    onEditarMenu: jest.fn(),
    onCerrar: jest.fn(),
  };

  test('cuatro pestañas, banda global y abre en «Diseño» en computador', () => {
    renderConIdioma(<HeaderInspector {...base} devicePreview="desktop" />);
    const pestanas = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(pestanas).toEqual(['Diseño', 'Contenido', 'Estilo', 'Celular']);
    expect(screen.getByRole('tab', { name: 'Diseño' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Cambia en todas las páginas')).toBeTruthy();
    expect(screen.getByText('Global · aparece en todas las páginas')).toBeTruthy();
    // Diseño: posición del logo; los colores van en Estilo.
    expect(screen.getByText('Posición del Logo')).toBeTruthy();
    expect(screen.queryByText('Colores del Header')).toBeNull();
  });

  test('con el lienzo en celular abre en «Celular» con el panel móvil', () => {
    renderConIdioma(<HeaderInspector {...base} devicePreview="mobile" />);
    expect(screen.getByRole('tab', { name: 'Celular' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Estilo del menú móvil')).toBeTruthy();
  });

  test('Contenido trae el menú con «Editar menú»; Estilo, los colores', () => {
    const onEditarMenu = jest.fn();
    renderConIdioma(<HeaderInspector {...base} onEditarMenu={onEditarMenu} devicePreview="desktop" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }));
    expect(screen.getByText('Menú del Header')).toBeTruthy();
    expect(screen.getByText('Botón CTA del header')).toBeTruthy();
    expect(screen.getByText('Orden de las acciones')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar menú' }));
    expect(onEditarMenu).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Estilo' }));
    expect(screen.getByText('Colores del Header')).toBeTruthy();
    expect(screen.getByText('Personalización del Botón CTA')).toBeTruthy();
    expect(screen.queryByText('Botón CTA del header')).toBeNull();
  });

  test('sin menús nombrados, «Editar menú» sigue disponible (páginas del sitio)', () => {
    const onEditarMenu = jest.fn();
    renderConIdioma(<HeaderInspector {...base} availableMenus={[]} onEditarMenu={onEditarMenu} devicePreview="desktop" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }));
    expect(screen.getByText('Páginas del sitio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar menú' }));
    expect(onEditarMenu).toHaveBeenCalledTimes(1);
  });

  test('cerrar avisa al editor', () => {
    const onCerrar = jest.fn();
    renderConIdioma(<HeaderInspector {...base} onCerrar={onCerrar} devicePreview="desktop" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar encabezado' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});

describe('FooterInspector', () => {
  test('pestañas del pie: diseño con menús, contenido, estilo y celular', () => {
    const onEditarMenus = jest.fn();
    renderConIdioma(
      <FooterInspector settings={SETTINGS} onUpdate={jest.fn()} devicePreview="desktop" onEditarMenus={onEditarMenus} onCerrar={jest.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Pie de página' })).toBeTruthy();
    expect(screen.getByText('Cambia en todas las páginas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar menús del pie' }));
    expect(onEditarMenus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }));
    expect(screen.getByText('Mostrar contacto')).toBeTruthy();
    expect(screen.queryByText('Fondo del footer')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Estilo' }));
    expect(screen.getByText('Fondo del footer')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Celular' }));
    expect(screen.getByText('Estilo del footer móvil')).toBeTruthy();
  });
});

describe('HojaMenu', () => {
  const base = {
    abierto: true,
    onAbiertoChange: jest.fn(),
    organizationId: 120,
    pendingMenuUpdatesRef: { current: new Map<string, Record<string, unknown>>() },
    onPendingChanges: jest.fn(),
  };

  test('encabezado con menú nombrado: monta su constructor y «Listo» cierra', () => {
    const onAbiertoChange = jest.fn();
    renderConIdioma(<HojaMenu {...base} onAbiertoChange={onAbiertoChange} zona="header" menuEncabezado={{ id: 'm-1', name: 'Principal' }} />);
    expect(screen.getByText('Menú del encabezado · Principal')).toBeTruthy();
    expect(screen.getByTestId('menu-group-editor').textContent).toBe('m-1');
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onAbiertoChange).toHaveBeenCalledWith(false);
  });

  test('encabezado sin menú nombrado: árbol de páginas, guardado con el editor', () => {
    renderConIdioma(<HojaMenu {...base} zona="header" menuEncabezado={null} />);
    expect(screen.getByTestId('menu-tree-editor')).toBeTruthy();
    expect(screen.getByText(/Se guarda con «Guardar» del editor/)).toBeTruthy();
  });

  test('pie: gestor de menús nombrados', () => {
    renderConIdioma(<HojaMenu {...base} zona="footer" menuEncabezado={null} />);
    expect(screen.getByText('Menús del pie')).toBeTruthy();
    expect(screen.getByTestId('menu-group-manager')).toBeTruthy();
  });
});

/**
 * @jest-environment jsdom
 *
 * Contexto de sede en el editor (decisión del dueño): barra «← [Sitio ▾] / [Página ▾]» neutra,
 * pregunta «¿Cambiar solo en <Sede> o en todas las sedes?» y la etiqueta «Solo en esta sede»
 * únicamente en lo distinto. Datos ficticios.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import { BarraEditor } from '../BarraEditor';
import { ListaSecciones } from '../ListaSecciones';
import { PreguntaSede } from '../PreguntaSede';

jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const barra = {
  paginas: [{ id: 'p1', title: 'Inicio' }],
  paginaId: 'p1',
  onCambiarPagina: jest.fn(),
  dispositivo: 'escritorio' as const,
  onDispositivo: jest.fn(),
  onDeshacer: jest.fn(),
  onRehacer: jest.fn(),
  puedeDeshacer: false,
  puedeRehacer: false,
  estado: null,
  enV2: true,
  urlPublica: null,
  onVistaPrevia: jest.fn(),
  textoPublicar: 'Publicar',
  onPublicar: jest.fn(),
  puedePublicar: false,
  acciones: [],
};

function seccion(id: string, tipo: string): WebsitePageSection {
  return {
    id,
    page_id: 'p1',
    organization_id: 120,
    section_type: tipo,
    section_variant: 'default',
    content: {},
    settings: {},
    sort_order: 0,
    is_visible: true,
    created_at: '',
    updated_at: '',
    branch_id: 7,
  } as WebsitePageSection;
}

describe('barra del editor', () => {
  test('sin migas de texto: primero el sitio y después la página; sin sedes el sitio se ve como texto', () => {
    renderConIdioma(<BarraEditor {...barra} sitioActual={null} sedes={[]} onCambiarSitio={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'Volver a Sitio web' }).getAttribute('href')).toBe('/app/sitio-web');
    const migas = screen.getByRole('navigation', { name: 'Sitio y página que editas' });
    expect(within(migas).getByText('Sitio principal')).toBeTruthy();
    expect(within(migas).queryByRole('combobox', { name: 'Sitio o sede que editas' })).toBeNull();
    expect(within(migas).getByRole('combobox', { name: 'Página que editas' }).textContent).toBe('Inicio');
  });

  test('con el principal y una sede ya hay qué elegir: el sitio es un selector', () => {
    renderConIdioma(<BarraEditor {...barra} sitioActual={null} sedes={[{ id: '7', nombre: 'Sede Norte' }]} onCambiarSitio={jest.fn()} />);
    const selector = screen.getByRole('combobox', { name: 'Sitio o sede que editas' });
    expect(selector.textContent).toBe('Sitio principal');
  });

  test('con dos sedes el sitio es un selector neutro (sin ámbar ni «Editando:»)', () => {
    renderConIdioma(
      <BarraEditor
        {...barra}
        sitioActual="7"
        sedes={[
          { id: '7', nombre: 'Sede Norte' },
          { id: '8', nombre: 'Sede Sur' },
        ]}
        onCambiarSitio={jest.fn()}
      />,
    );
    const selector = screen.getByRole('combobox', { name: 'Sitio o sede que editas' });
    expect(selector.textContent).toBe('Sede Norte');
    expect(selector.className).not.toMatch(/warning/);
    expect(screen.queryByText(/Editando/)).toBeNull();
  });

  test('cuatro dispositivos con su ancho: 1440, 1024, 768 y 390', () => {
    renderConIdioma(<BarraEditor {...barra} sitioActual={null} sedes={[]} />);
    for (const nombre of ['Computador · 1440 px', 'Portátil · 1024 px', 'Tableta · 768 px', 'Celular · 390 px']) {
      expect(screen.getByRole('radio', { name: nombre })).toBeTruthy();
    }
  });
});

describe('pregunta al cambiar una sección compartida', () => {
  test('«Solo en <Sede>» y «En todas» responden; nada se separa sin elegir', () => {
    const onResponder = jest.fn();
    renderConIdioma(<PreguntaSede sede="Sede Norte" onResponder={onResponder} onCancelar={jest.fn()} />);
    expect(screen.getByText('¿Cambiar solo en Sede Norte o en todas las sedes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Solo en Sede Norte' }));
    fireEvent.click(screen.getByRole('button', { name: 'En todas' }));
    expect(onResponder.mock.calls).toEqual([['sede'], ['todas']]);
  });
});

describe('pregunta al quitar una sección compartida', () => {
  test('quitar también pregunta: «¿Quitar solo en <Sede> o en todas las sedes?»', () => {
    renderConIdioma(<PreguntaSede sede="Sede Norte" accion="quitar" onResponder={jest.fn()} onCancelar={jest.fn()} />);
    expect(screen.getByText('¿Quitar solo en Sede Norte o en todas las sedes?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Solo en Sede Norte' })).toBeTruthy();
  });
});

describe('lista de secciones en una sede', () => {
  test('solo lo distinto lleva «Solo en esta sede»; lo heredado no lleva etiqueta ni candado', () => {
    const ambitos: Record<string, 'heredada' | 'personalizada' | 'solo-esta-sede'> = { a: 'heredada', b: 'personalizada', c: 'solo-esta-sede' };
    renderConIdioma(
      <ListaSecciones
        tituloPagina="Inicio"
        secciones={[seccion('a', 'hero'), seccion('b', 'faq'), seccion('c', 'gallery')]}
        seleccionada={null}
        zona={null}
        onSeleccionar={jest.fn()}
        onSeleccionarZona={jest.fn()}
        onAlternarVisible={jest.fn()}
        onDuplicar={jest.fn()}
        onEliminar={jest.fn()}
        onMover={jest.fn()}
        onAnadir={jest.fn()}
        onEstiloSitio={jest.fn()}
        ambito={(id) => ambitos[id]}
      />,
    );
    expect(screen.getAllByText('Solo en esta sede')).toHaveLength(2);
    expect(screen.queryByText('Hereda')).toBeNull();
    expect(screen.queryByText('Global')).toBeNull();
    expect(screen.getByText('Encabezado')).toBeTruthy();
  });
});

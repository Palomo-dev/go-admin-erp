/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CampoRepetidor, elementosRepetidor } from '../CampoRepetidor';
import { CampoAlineacion } from '../CampoAlineacion';
import { PRODUCT_CARD_INTERACTION_FIELDS } from '@/lib/services/website/sectionFieldGroups';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/organization/branding/editor/fields/FieldRenderer', () => ({ __esModule: true, default: () => <span>Campo compuesto</span> }));
jest.mock('../EditorBoletin', () => ({ EditorBoletin: () => null }));
jest.mock('../EditorCascaron', () => ({ EditorPestanas: () => null }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/sitio-web' }));

const etiquetas = PRODUCT_CARD_INTERACTION_FIELDS.find((c) => c.key === 'badges')!;
const props = { campo: etiquetas, valor: undefined, contenido: {}, categorias: { lista: [], cargando: false }, onCambiar: jest.fn(), onCambiarContenido: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe.each([390, 1440])('campos de tarjeta · ancho %i', (ancho) => {
  beforeEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: ancho }));
  test('predeterminados desde el primer render; abrir/cerrar no guarda cambios', () => {
    renderConIdioma(<CampoRepetidor {...props} />);
    expect(screen.getByText('Etiquetas (badges) (4)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descuento' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agotado' })).toBeTruthy();
    expect(props.onCambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Descuento' }));
    expect(screen.getByDisplayValue('-{value}%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Descuento' }));
    expect(props.onCambiar).not.toHaveBeenCalled();
  });
  test('editar un predeterminado guarda solo por interacción; preserva el resto', () => {
    renderConIdioma(<CampoRepetidor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Descuento' }));
    fireEvent.change(screen.getByDisplayValue('-{value}%'), { target: { value: 'Oferta {value}%' } });
    expect(props.onCambiar).toHaveBeenCalledTimes(1);
    const guardado = props.onCambiar.mock.calls[0][0] as Record<string, unknown>[];
    expect(guardado).toHaveLength(4);
    expect(guardado[0].label).toBe('Oferta {value}%');
    expect(guardado[1]).toEqual(etiquetas.defaultItems?.[1]);
  });
  test('alineación 3×3 muestra y guarda las nueve posiciones completas', () => {
    const cambiar = jest.fn();
    const campo: ContentFieldDef = { key: 'text_align', label: 'Alineación', type: 'alignment', defaultValue: 'left' };
    renderConIdioma(<CampoAlineacion campo={campo} valor={undefined} onCambiar={cambiar} />);
    expect(screen.getAllByRole('radio')).toHaveLength(9);
    expect(cambiar).not.toHaveBeenCalled();
    for (const nombre of ['Arriba izquierda', 'Arriba centro', 'Arriba derecha', 'Centro izquierda', 'Centro centro', 'Centro derecha', 'Abajo izquierda', 'Abajo centro', 'Abajo derecha']) fireEvent.click(screen.getByRole('radio', { name: nombre }));
    expect(cambiar.mock.calls.map(([v]) => v)).toEqual(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']);
  });
});

test('valores guardados y lista vacía no se reemplazan por predeterminados', () => {
  const guardados = [{ type: 'custom', label: 'Hecho a mano' }];
  expect(elementosRepetidor(etiquetas, guardados)).toEqual(guardados);
  expect(elementosRepetidor(etiquetas, [])).toEqual([]);
});

test('las formas nuevas conservan píldora, cuadrado, cinta y esquina', () => {
  const formas = etiquetas.itemFields?.find((f) => f.key === 'shape')?.options?.map((o) => o.value);
  expect(formas).toEqual(['pill', 'square', 'rounded', 'semi', 'ribbon', 'corner']);
  const botones = PRODUCT_CARD_INTERACTION_FIELDS.find((f) => f.key === 'card_buttons');
  expect(botones?.itemFields?.find((f) => f.key === 'action')?.options).toContainEqual({ value: 'choose', label: 'Elegir variantes o modificadores' });
});

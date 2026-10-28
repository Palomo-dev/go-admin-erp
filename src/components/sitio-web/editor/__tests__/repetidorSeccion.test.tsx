/**
 * @jest-environment jsdom
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { RepetidorSeccion, operarRepetidor, campoElementoVisible } from '../inspector/RepetidorSeccion';
import { getSectionDefinition, SECTION_CATALOG, type ContentFieldDef } from '@/lib/services/websitePageBuilderService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

const formFields = getSectionDefinition('contact_form')!.contentFields.find((c) => c.key === 'form_fields') as ContentFieldDef;
const categorias = { lista: [], cargando: false };

describe('CONTAC-04: repetidor del kit', () => {
  test('operaciones: agregar con valores por defecto, duplicar, mover, quitar, editar; siempre con id', () => {
    const a = operarRepetidor([{ name: 'phone', label: 'Teléfono' }], { tipo: 'agregar', campos: formFields.itemFields! });
    expect(a).toHaveLength(2);
    expect(a.every((e) => typeof e.id === 'string')).toBe(true);
    expect(a[1]).toMatchObject({ required: false });
    const d = operarRepetidor(a, { tipo: 'duplicar', i: 0 });
    expect(d.map((e) => e.label)).toEqual(['Teléfono', 'Teléfono', undefined]);
    expect(d[0].id).not.toBe(d[1].id);
    expect(operarRepetidor(d, { tipo: 'mover', de: 2, a: 0 })[0].label).toBeUndefined();
    expect(operarRepetidor(d, { tipo: 'mover', de: 0, a: -1 })).toEqual(d);
    expect(operarRepetidor(d, { tipo: 'quitar', i: 1 })).toHaveLength(2);
    expect(operarRepetidor(d, { tipo: 'editar', i: 2, clave: 'label', valor: 'Empresa' })[2]).toMatchObject({ label: 'Empresa', id: d[2].id });
  });

  test('showIf dentro del elemento', () => {
    const f = { key: 'x', label: 'X', type: 'text', showIf: { field: 'type', equals: 'select' } } as ContentFieldDef;
    expect(campoElementoVisible(f, { type: 'select' })).toBe(true);
    expect(campoElementoVisible(f, { type: 'text' })).toBe(false);
  });

  test('form_fields: se ve, agrega y edita con controles del kit; abrir no escribe', () => {
    const cambiar = jest.fn();
    renderConIdioma(<RepetidorSeccion campo={formFields} valor={[{ id: 'a', name: 'phone', label: 'Teléfono', type: 'tel' }]} onCambiar={cambiar} categorias={categorias} />);
    expect(screen.getByRole('group', { name: 'Campos del formulario' })).toBeTruthy();
    fireEvent.click(screen.getAllByText('Teléfono')[0]);
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue('Teléfono'), { target: { value: 'Celular' } });
    expect(cambiar).toHaveBeenLastCalledWith([{ id: 'a', name: 'phone', label: 'Celular', type: 'tel' }]);
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    expect(cambiar.mock.calls.at(-1)[0]).toHaveLength(2);
  });

  test('testimonials vacío: el panel dice lo que pinta la tienda y cuenta 0; no escribe', () => {
    const items = getSectionDefinition('testimonials')!.contentFields.find((c) => c.key === 'items') as ContentFieldDef;
    const cambiar = jest.fn();
    renderConIdioma(<RepetidorSeccion campo={items} valor={[]} onCambiar={cambiar} categorias={categorias} />);
    expect(screen.getByText(/La tienda muestra «No hay testimonios disponibles aún»/)).toBeTruthy();
    expect(screen.queryByText(/Se muestran los de siempre/)).toBeNull();
    expect(screen.getByText('(0)')).toBeTruthy();
    expect(cambiar).not.toHaveBeenCalled();
  });

  test('arrastrar reordena una sola vez, al soltar', () => {
    const cambiar = jest.fn();
    const v = [{ id: 'a', name: 'a', label: 'Uno' }, { id: 'b', name: 'b', label: 'Dos' }, { id: 'c', name: 'c', label: 'Tres' }];
    const { container } = renderConIdioma(<RepetidorSeccion campo={formFields} valor={v} onCambiar={cambiar} categorias={categorias} />);
    const filas = container.querySelectorAll('[draggable="true"]');
    const dt = { setData: jest.fn(), effectAllowed: '' };
    fireEvent.dragStart(filas[0], { dataTransfer: dt });
    fireEvent.dragOver(filas[1], { dataTransfer: dt });
    fireEvent.dragOver(filas[2], { dataTransfer: dt });
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.drop(filas[2], { dataTransfer: dt });
    expect(cambiar).toHaveBeenCalledTimes(1);
    expect(cambiar.mock.calls[0][0].map((e: { id: string }) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

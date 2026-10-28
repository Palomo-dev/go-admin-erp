/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';
import { ColorTema } from '../inspector/PartesZonaGlobal';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('next-intl', () => ({ useTranslations: () => Object.assign((k: string) => k, { has: () => false }) }));

// QA 4b AMARILLO 2: sin color guardado no se muestra un hex (349: el H2 es de la plantilla, no #FAF7F2).
describe('colores del título/descripción sin valor', () => {
  it('ColorTema sin valor no pinta un campo de hex', () => {
    const { container, getByText } = render(<ColorTema etiqueta="Título" etiquetaNulo="Como el texto / la plantilla" valor={null} colorTema="#FAF7F2" onCambiar={jest.fn()} />);
    expect(getByText('Como el texto / la plantilla')).toBeTruthy();
    expect(container.textContent).not.toMatch(/#FAF7F2/i);
  });
  it('InspectorEstilo usa ColorTema para título y descripción', () => {
    const src = readFileSync(join(__dirname, '../inspector/InspectorEstilo.tsx'), 'utf8');
    expect(src).toContain("<ColorTema etiqueta={t('estilo.encabezado.titulo')} etiquetaNulo={nulo} valor={titulo ?? null}");
    expect(src).toContain("<ColorTema etiqueta={t('estilo.encabezado.descripcion')} etiquetaNulo={nulo} valor={desc ?? null}");
  });
});

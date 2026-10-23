/**
 * @jest-environment jsdom
 *
 * El aviso de solapamiento es en línea, lista las promociones y no se pinta
 * si no hay conflicto. Los cuatro idiomas tienen la clave.
 */
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { AvisoSolapamiento } from '../AvisoSolapamiento';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const TITULOS: Record<IdiomaPrueba, string> = {
  es: 'Solo se aplicará una por producto',
  en: 'Only one will apply per product',
  fr: "Une seule s'appliquera par produit",
  pt: 'Só uma será aplicada por produto',
};

describe('AvisoSolapamiento', () => {
  it.each(['es', 'en', 'fr', 'pt'] as IdiomaPrueba[])('en %s lista el conflicto y su enlace', (idioma) => {
    renderConIdioma(
      <AvisoSolapamiento conflictos={[{ id: 'promo-1', name: 'Diez por ciento' }]} />,
      { idioma },
    );
    expect(screen.getByRole('status').textContent).toContain(TITULOS[idioma]);
    const enlace = screen.getByRole('link');
    expect(enlace.getAttribute('href')).toBe('/app/pos/promociones/promo-1');
    expect(enlace.textContent).toContain('Diez por ciento');
  });

  it('no pinta nada si no hay solapamiento', () => {
    const { container } = renderConIdioma(<AvisoSolapamiento conflictos={[]} />);
    expect(container.textContent).toBe('');
  });
});

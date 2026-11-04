/** @jest-environment jsdom */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));

import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { CampoColorIconoCategoria } from '../inspector/CampoColorIconoCategoria';
import {
  COLORES_ICONO_CATEGORIA,
  FONDOS_ICONO_CATEGORIA,
  esquemaColorIconoCategoria,
  esquemaFondoIconoCategoria,
  esquemaSeccion,
} from '@/lib/website/contrato/documentoSitio';
import { chipColorIcono, hexColorIcono, valorColorIcono } from '../inspector/iconoCategoriaLogica';

describe('contrato: ícono de la rejilla de categorías', () => {
  it('icon_color: category, primary, secondary o un hex', () => {
    expect([...COLORES_ICONO_CATEGORIA]).toEqual(['category', 'primary', 'secondary']);
    for (const v of ['category', 'primary', 'secondary', '#00AA11', '#0a1']) expect(esquemaColorIconoCategoria.safeParse(v).success).toBe(true);
    for (const v of ['custom', 'rojo', '#12345', 'red;x', 5, null]) expect(esquemaColorIconoCategoria.safeParse(v).success).toBe(false);
  });

  it('icon_bg_mode: soft, solid o none', () => {
    expect([...FONDOS_ICONO_CATEGORIA]).toEqual(['soft', 'solid', 'none']);
    expect(esquemaFondoIconoCategoria.safeParse('solid').success).toBe(true);
    expect(esquemaFondoIconoCategoria.safeParse('SOLID').success).toBe(false);
  });

  it('un valor inválido no rechaza la sección (contenido no se valida por clave)', () => {
    const seccion = { id: 's1', tipo: 'categories_grid', variante: null, version: 1, contenido: { icon_color: 'x', icon_bg_mode: 9 }, diseno: {} };
    expect(esquemaSeccion.safeParse(seccion).success).toBe(true);
  });
});

describe('catálogo de categories_grid', () => {
  const campos = getSectionDefinition('categories_grid')?.contentFields ?? [];
  const campo = (k: string) => campos.find((c) => c.key === k);

  it('«Color del ícono»: los valores del contrato más «Personalizado», por defecto el de la categoría', () => {
    const c = campo('icon_color');
    expect(c).toBeDefined();
    expect(c?.defaultValue).toBe('category');
    expect(c?.options?.map((o) => o.value)).toEqual([...COLORES_ICONO_CATEGORIA, 'custom']);
    expect(c?.options?.map((o) => o.label)).toEqual(['De la categoría', 'Primario', 'Secundario', 'Personalizado']);
  });

  it('«Fondo del ícono»: los valores del contrato, por defecto suave; «Fondo de la imagen» se mantiene', () => {
    const c = campo('icon_bg_mode');
    expect(c?.defaultValue).toBe('soft');
    expect(c?.options?.map((o) => o.value)).toEqual([...FONDOS_ICONO_CATEGORIA]);
    expect(c?.options?.map((o) => o.label)).toEqual(['Suave', 'Sólido', 'Sin fondo']);
    expect(campo('image_bg')).toBeDefined();
  });

  it('los dos van en Diseño, junto al resto del estilo de la tarjeta', () => {
    expect(campo('icon_color')?.group).toBe('behavior');
    expect(campo('icon_bg_mode')?.group).toBe('behavior');
  });
});

describe('«Color del ícono» en el panel', () => {
  it('el chip refleja lo guardado; ausente o inválido es «De la categoría» (lo de hoy)', () => {
    expect(chipColorIcono(undefined)).toBe('category');
    expect(chipColorIcono('loquesea')).toBe('category');
    expect(chipColorIcono('primary')).toBe('primary');
    expect(chipColorIcono('secondary')).toBe('secondary');
    expect(chipColorIcono('#ff0000')).toBe('custom');
    expect(hexColorIcono('#ff0000')).toBe('#ff0000');
    expect(hexColorIcono('primary')).toBeNull();
  });

  it('«Personalizado» guarda un hex, nunca la palabra', () => {
    expect(valorColorIcono('custom', undefined, '#123456')).toBe('#123456');
    expect(valorColorIcono('custom', '#abcdef', '#123456')).toBe('#abcdef');
    expect(valorColorIcono('custom', 'primary', 'no-es-hex')).toBe('#111827');
    for (const chip of ['category', 'primary', 'secondary'] as const) expect(valorColorIcono(chip, '#abcdef', '#123456')).toBe(chip);
    for (const chip of ['category', 'primary', 'secondary', 'custom'] as const) {
      expect(esquemaColorIconoCategoria.safeParse(valorColorIcono(chip, undefined, '#123456')).success).toBe(true);
    }
  });
});

describe('CampoColorIconoCategoria', () => {
  const campo = getSectionDefinition('categories_grid')!.contentFields.find((c) => c.key === 'icon_color')!;

  it('cuatro chips; sin valor marca «De la categoría» y no muestra el color', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<CampoColorIconoCategoria campo={campo} valor={undefined} colorInicial="#123456" onCambiar={onCambiar} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Color del ícono' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['De la categoría', 'Primario', 'Secundario', 'Personalizado']);
    expect(within(grupo).getByRole('radio', { name: 'De la categoría' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Secundario' }));
    expect(onCambiar).toHaveBeenLastCalledWith('secondary');
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Personalizado' }));
    expect(onCambiar).toHaveBeenLastCalledWith('#123456');
  });

  it('con un hex guardado marca «Personalizado» y muestra el campo de color', () => {
    renderConIdioma(<CampoColorIconoCategoria campo={campo} valor="#abcdef" colorInicial="#123456" onCambiar={jest.fn()} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Color del ícono' });
    expect(within(grupo).getByRole('radio', { name: 'Personalizado' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByDisplayValue(/abcdef/i).length).toBeGreaterThan(0);
  });
});

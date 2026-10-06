/**
 * @jest-environment jsdom
 *
 * Piezas del estilo por sección (Figma «figma-estilo» 05-10) y del logo y la
 * carta: colores y fuentes enlazados al tema, visibilidad por dispositivo,
 * CampoLogoFavicon y EtiquetaDieta.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { referenciaMarca, resolverColorMarca, rolDeReferencia, esReferenciaMarca } from '@/lib/website/v2/colorMarca';
import { referenciaFuenteTema, resolverFuenteTema, sigueAlTema } from '@/lib/website/v2/fuenteTema';
import { desdeVisibilidadDocumento, resumirVisibilidad } from '../visibilidadDispositivo';
import { DeviceToggle, DeviceToggleGroup } from '../DeviceToggle';
import { DeviceVisibilityChip } from '../DeviceVisibilityChip';
import { FontOption } from '../FontOption';
import { FontField } from '../FontField';
import { ColorMarcaField } from '../ColorMarcaField';
import { CampoLogoFavicon } from '../CampoLogoFavicon';
import { EtiquetaDieta } from '../EtiquetaDieta';
import { SortableRow } from '../SortableRow';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/dynamic', () => () => () => null);

const COLORES = { primario: '#8B1E1E', secundario: '#2B2B2B', acento: '#C8A97E', texto: '#F2EEE6', fondo: '#0B0B0B' };

describe('colorMarca (puro)', () => {
  test('referencia, rol y resolución', () => {
    expect(referenciaMarca('acento')).toBe('marca:acento');
    expect(rolDeReferencia('marca:acento')).toBe('acento');
    expect(rolDeReferencia('marca:otro')).toBeNull();
    expect(rolDeReferencia('#C8A97E')).toBeNull();
    expect(esReferenciaMarca('marca:fondo')).toBe(true);
    expect(resolverColorMarca('marca:acento', COLORES)).toBe('#C8A97E');
    expect(resolverColorMarca('#123456', COLORES)).toBe('#123456');
    expect(resolverColorMarca('marca:acento', {})).toBeNull();
    expect(resolverColorMarca('', COLORES)).toBeNull();
  });
});

describe('fuenteTema (puro)', () => {
  const F = { titulos: 'Playfair Display', cuerpo: 'Inter' };
  test('null toma el rol por defecto; referencia y familia', () => {
    expect(resolverFuenteTema(null, F, 'titulos')).toBe('Playfair Display');
    expect(resolverFuenteTema(referenciaFuenteTema('cuerpo'), F, 'titulos')).toBe('Inter');
    expect(resolverFuenteTema('Poppins', F, 'titulos')).toBe('Poppins');
    expect(sigueAlTema(null)).toBe(true);
    expect(sigueAlTema('tema:titulos')).toBe(true);
    expect(sigueAlTema('Poppins')).toBe(false);
  });
});

describe('visibilidad por dispositivo (puro)', () => {
  test.each([
    [{ computador: true, tableta: true, celular: true }, { tipo: 'todos' }],
    [{ computador: true, tableta: true, celular: false }, { tipo: 'oculta', dispositivo: 'celular' }],
    [{ computador: true, tableta: false, celular: false }, { tipo: 'solo', dispositivo: 'computador' }],
    [{ computador: false, tableta: false, celular: false }, { tipo: 'ninguno' }],
  ])('%o', (v, esperado) => {
    expect(resumirVisibilidad(v)).toEqual(esperado);
  });

  test('documento V2: la tableta sigue al computador mientras no tenga campo', () => {
    expect(desdeVisibilidadDocumento({ movil: false, escritorio: true })).toEqual({ computador: true, tableta: true, celular: false });
    expect(desdeVisibilidadDocumento(undefined)).toEqual({ computador: true, tableta: true, celular: true });
    expect(desdeVisibilidadDocumento({ movil: true, escritorio: true, tableta: false }).tableta).toBe(false);
  });
});

describe('DeviceToggle (08) y DeviceVisibilityChip (09)', () => {
  test('aria-pressed y alternar', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<DeviceToggle dispositivo="celular" visible onCambiar={onCambiar} />);
    const b = screen.getByRole('button', { name: 'Mostrar en Celular' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(b);
    expect(onCambiar).toHaveBeenCalledWith(false);
  });

  test('grupo: cambia solo el dispositivo pulsado', () => {
    const onCambiar = jest.fn();
    renderConIdioma(
      <DeviceToggleGroup etiqueta="Mostrar la sección en" valor={{ computador: true, tableta: true, celular: true }} onCambiar={onCambiar} />,
    );
    expect(screen.getByRole('group', { name: 'Mostrar la sección en' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar en Tableta' }));
    expect(onCambiar).toHaveBeenCalledWith({ computador: true, tableta: false, celular: true });
  });

  test('chip: textos del diseño y nada si se ve en todos', () => {
    const { container, rerender } = renderConIdioma(
      <DeviceVisibilityChip visibilidad={{ computador: true, tableta: true, celular: false }} />,
    );
    expect(container.textContent).toBe('Oculta en celular');
    rerender(<DeviceVisibilityChip visibilidad={{ computador: true, tableta: false, celular: false }} />);
    expect(container.textContent).toBe('Solo en computador');
    rerender(<DeviceVisibilityChip visibilidad={{ computador: true, tableta: true, celular: true }} />);
    expect(container.textContent).toBe('');
  });

  test('SortableRow con el chip como detalle (10)', () => {
    renderConIdioma(
      <SortableRow
        etiqueta="Carta destacada"
        detalle={<DeviceVisibilityChip visibilidad={{ computador: true, tableta: true, celular: false }} />}
      />,
    );
    expect(screen.getByText('Oculta en celular')).toBeTruthy();
  });
});

describe('FontOption (07) y FontField (06)', () => {
  test('opción seleccionada', () => {
    renderConIdioma(
      <div role="listbox">
        <FontOption familia="Playfair Display" descripcion="Títulos del sitio" seleccionada />
      </div>,
    );
    const o = screen.getByRole('option');
    expect(o.getAttribute('aria-selected')).toBe('true');
    expect(o.textContent).toContain('Playfair Display');
    expect(o.textContent).toContain('Títulos del sitio');
  });

  test('disparador con «Del sitio»; grupos; elegir del catálogo y volver al tema', () => {
    const onCambiar = jest.fn();
    const { rerender } = renderConIdioma(
      <FontField
        etiqueta="Fuente del título"
        valor={null}
        porDefecto="titulos"
        fuentesTema={{ titulos: 'Playfair Display', cuerpo: 'Inter' }}
        catalogo={['Cormorant Garamond', 'Inter', 'Poppins']}
        onCambiar={onCambiar}
      />,
    );
    const disparador = screen.getByRole('button', { name: 'Fuente del título' });
    expect(disparador.textContent).toContain('Playfair Display');
    expect(disparador.textContent).toContain('Del sitio');
    fireEvent.click(disparador);
    expect(screen.getByRole('group', { name: 'Fuentes del tema' })).toBeTruthy();
    const otras = screen.getByRole('group', { name: 'Otras del catálogo del tema' });
    // «Inter» ya está en el tema: no se repite en el catálogo.
    expect(otras.textContent).not.toContain('Inter');
    fireEvent.click(screen.getByRole('option', { name: /Poppins/ }));
    expect(onCambiar).toHaveBeenLastCalledWith('Poppins');

    rerender(
      <FontField
        etiqueta="Fuente del título"
        valor="Poppins"
        porDefecto="titulos"
        fuentesTema={{ titulos: 'Playfair Display', cuerpo: 'Inter' }}
        catalogo={['Poppins']}
        onCambiar={onCambiar}
      />,
    );
    const d2 = screen.getByRole('button', { name: 'Fuente del título' });
    expect(d2.textContent).not.toContain('Del sitio');
    fireEvent.click(d2);
    fireEvent.click(screen.getByRole('option', { name: /Playfair Display/ }));
    // La fuente por defecto del campo se guarda como null (sigue al tema).
    expect(onCambiar).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Fuente del título' }));
    fireEvent.click(screen.getByRole('option', { name: /Inter/ }));
    expect(onCambiar).toHaveBeenLastCalledWith('tema:cuerpo');
  });
});

describe('ColorMarcaField (05)', () => {
  test('enlazado: «Acento de la marca»; elegir otro rol y personalizar', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<ColorMarcaField etiqueta="Acento" valor="marca:acento" colores={COLORES} onCambiar={onCambiar} />);
    const d = screen.getByRole('button', { name: 'Acento' });
    expect(d.textContent).toContain('Acento');
    expect(d.textContent).toContain('de la marca');
    fireEvent.click(d);
    expect(screen.getByText(/Enlazados: si cambias la marca/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Acento/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Primario/ }));
    expect(onCambiar).toHaveBeenLastCalledWith('marca:primario');
    fireEvent.click(screen.getByRole('button', { name: 'Acento' }));
    fireEvent.change(screen.getByLabelText('Personalizado'), { target: { value: '#112233' } });
    expect(onCambiar).toHaveBeenLastCalledWith('#112233');
  });

  test('personalizado con poco contraste: aviso AA y corregir', () => {
    const onCambiar = jest.fn();
    renderConIdioma(
      <ColorMarcaField etiqueta="Texto" valor="#C8A97E" colores={{ ...COLORES, fondo: '#FFFFFF' }} onCambiar={onCambiar} />,
    );
    expect(screen.getByText(/Mínimo 4,5:1 \(AA\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Corregir automáticamente' }));
    expect(onCambiar).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9A-F]{6}$/));
  });
});

describe('CampoLogoFavicon y EtiquetaDieta', () => {
  test('dos tarjetas, «Cambiar»/«Subir» y «Quitar»', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<CampoLogoFavicon logoUrl="https://x/logo.png" faviconUrl={null} permitirQuitar onCambiar={onCambiar} />);
    expect(screen.getByRole('img', { name: 'Logo actual' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar Logo' }).textContent).toBe('Cambiar');
    expect(screen.getByRole('button', { name: 'Cambiar Favicon' }).textContent).toBe('Subir');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Logo' }));
    expect(onCambiar).toHaveBeenCalledWith('logo', null);
    expect(screen.queryByRole('button', { name: 'Quitar Favicon' })).toBeNull();
  });

  test('etiqueta de dieta con su texto', () => {
    renderConIdioma(<EtiquetaDieta texto="Sin gluten" tipo="dieta" />);
    expect(screen.getByText('Sin gluten').closest('[title]')?.getAttribute('title')).toBe('Etiqueta de dieta');
  });
});

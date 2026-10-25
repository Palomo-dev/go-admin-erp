/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CampoImagenSeccion } from '../CampoImagenSeccion';
import { subirImagen } from '@/components/inventario/imagenes/ImagenesService';
import { leerEstiloSeccion, normalizarEstilo, restablecerGrupoEstilo } from '@/lib/website/v2/estiloSeccion';

jest.mock('@/components/inventario/imagenes/ImagenesService', () => ({ subirImagen: jest.fn(), ErrorSubida: class extends Error {} }));
jest.mock('@/components/inventario/productos/imagenes/DialogoBibliotecaImagenes', () => ({ DialogoBibliotecaImagenes: ({ abierto, onElegidas }: { abierto: boolean; onElegidas: (i: { url: string }[]) => void }) => abierto ? <button onClick={() => onElegidas([{ url: 'https://example.org/galeria.png' }])}>Elegir desde biblioteca</button> : null }));

beforeEach(() => jest.clearAllMocks());

describe.each([390, 1440])('fondo de imagen · ancho %i', ancho => {
  beforeEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: ancho }));
  test('galería y subida visibles desde el inicio; navegar no guarda', async () => {
    const onCambiar = jest.fn();
    renderConIdioma(<CampoImagenSeccion organizationId={140} onCambiar={onCambiar} />);
    expect(screen.getByRole('button', { name: 'Galería' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeTruthy();
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Galería' }));
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir desde biblioteca' }));
    expect(onCambiar).toHaveBeenCalledWith('https://example.org/galeria.png');
  });
  test('sube usando la organización de sesión y entrega la URL para preview/publicación', async () => {
    jest.mocked(subirImagen).mockResolvedValueOnce({ url: 'https://example.org/subida.png' } as Awaited<ReturnType<typeof subirImagen>>);
    const onCambiar = jest.fn();
    renderConIdioma(<CampoImagenSeccion organizationId={140} onCambiar={onCambiar} />);
    const archivo = new File(['png'], 'fondo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen de fondo'), { target: { files: [archivo] } });
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith('https://example.org/subida.png'));
    expect(subirImagen).toHaveBeenCalledWith(140, archivo, expect.any(Function));
  });
  test('fallo de subida no reemplaza el fondo guardado', async () => {
    jest.mocked(subirImagen).mockRejectedValueOnce(new Error('fallo de red'));
    const onCambiar = jest.fn();
    renderConIdioma(<CampoImagenSeccion organizationId={140} valor="https://example.org/anterior.png" onCambiar={onCambiar} />);
    fireEvent.change(screen.getByLabelText('Subir imagen de fondo'), { target: { files: [new File(['png'], 'fondo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByAltText('Vista previa del fondo').getAttribute('src')).toBe('https://example.org/anterior.png');
  });
});

test('la imagen sobrevive lectura, guardado y restauración de herencia', () => {
  const estilo = leerEstiloSeccion({ estilo: { v: 1, fondo: 'imagen', imagenFondo: 'https://example.org/fondo.png' } });
  expect(normalizarEstilo(estilo).imagenFondo).toBe('https://example.org/fondo.png');
  const visibilidad = { computador: true, tableta: true, celular: true };
  expect(restablecerGrupoEstilo({ estilo: { v: 1 }, visibilidad }, { estilo, visibilidad }, 'fondo').estilo.imagenFondo).toBe(estilo.imagenFondo);
  expect(leerEstiloSeccion({ estilo: { imagenFondo: 'javascript:alert(1)' } }).imagenFondo).toBeUndefined();
});

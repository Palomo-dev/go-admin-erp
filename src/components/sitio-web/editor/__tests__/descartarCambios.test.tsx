/**
 * @jest-environment jsdom
 *
 * «Descartar cambios» en la barra del editor y Deshacer sin historial. La lógica del servidor
 * (el borrador vuelve a la revisión publicada; el contador queda en 0) está en
 * siteDocumentService.test.ts. Datos ficticios.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { interpolar } from '@/components/sitio-web/ui/textos';
import { BarraEditor } from '../BarraEditor';
import { textoEditor } from '../textos';

jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const barra = {
  paginas: [{ id: 'p1', title: 'Inicio' }],
  paginaId: 'p1',
  onCambiarPagina: jest.fn(),
  sitioActual: null,
  sedes: [],
  dispositivo: 'escritorio' as const,
  onDispositivo: jest.fn(),
  onDeshacer: jest.fn(),
  onRehacer: jest.fn(),
  puedeDeshacer: false,
  puedeRehacer: false,
  estado: { tipo: 'cambios' as const, cantidad: 3 },
  enV2: true,
  urlPublica: null,
  onVistaPrevia: jest.fn(),
  textoPublicar: 'Publicar',
  onPublicar: jest.fn(),
  puedePublicar: true,
  acciones: [],
};

describe('botón «Descartar cambios»', () => {
  test('con cambios: habilitado y llama a onDescartar (la confirmación la abre el editor)', () => {
    const onDescartar = jest.fn();
    renderConIdioma(<BarraEditor {...barra} onDescartar={onDescartar} puedeDescartar />);
    const boton = screen.getByRole('button', { name: 'Descartar cambios' });
    expect((boton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(boton);
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });

  test('sin cambios que descartar: deshabilitado', () => {
    renderConIdioma(<BarraEditor {...barra} onDescartar={jest.fn()} puedeDescartar={false} />);
    expect((screen.getByRole('button', { name: 'Descartar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('legacy o sin publicación (sin onDescartar): no se muestra', () => {
    renderConIdioma(<BarraEditor {...barra} />);
    expect(screen.queryByRole('button', { name: 'Descartar cambios' })).toBeNull();
  });

  test('Deshacer sin historial sigue disponible si el editor lo permite (borrador con cambios)', () => {
    const onDeshacer = jest.fn();
    renderConIdioma(<BarraEditor {...barra} puedeDeshacer onDeshacer={onDeshacer} onDescartar={jest.fn()} puedeDescartar />);
    const deshacer = screen.getByRole('button', { name: 'Deshacer' });
    expect((deshacer as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(deshacer);
    expect(onDeshacer).toHaveBeenCalledTimes(1);
  });
});

describe('texto de la confirmación', () => {
  test('«Se perderán N cambios sin publicar. ¿Descartar?»', () => {
    expect(interpolar(textoEditor('descartar.descripcion') ?? '', { n: 4 })).toBe('Se perderán 4 cambios sin publicar. ¿Descartar?');
    expect(textoEditor('descartar.descripcionUno')).toBe('Se perderá 1 cambio sin publicar. ¿Descartar?');
  });
});

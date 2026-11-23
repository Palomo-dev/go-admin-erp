/**
 * @jest-environment jsdom
 *
 * «Ficha de producto › Acciones de compra», pestaña Contenido (Figma 2787:66244, 2788:66782,
 * 2789:67326): distribuciones con miniatura, lista de botones, «Agregar» que no se oculta, textos
 * que se conservan, «Personalizada» al mover, aviso de WhatsApp sin número y el inspector de la
 * sección que ya no ofrece `position` ni `buttons[]`. Textos reales (messages/*.json).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { EditorAccionesFicha } from '../EditorAccionesFicha';
import { InspectorSeccion } from '../InspectorSeccion';
import { DISTRIBUCIONES, leerAccionesFicha, type AccionFicha } from '@/lib/website/v2/accionesFicha';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

const ultimo = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;

describe('Acciones de compra › Contenido', () => {
  test('sin configuración muestra «Clásica» elegida y no escribe nada al abrir', () => {
    const onCambiar = jest.fn();
    render(<EditorAccionesFicha contenido={{}} onCambiar={onCambiar} numeroWhatsapp="3001234567" />);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Clásica/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    // «Agregar al carrito» y el corazón comparten fila: van en el mismo recuadro.
    expect(screen.getByRole('group', { name: 'Misma fila · Agregar al carrito + Favorito (corazón)' })).toBeTruthy();
  });

  test('elegir «Dos a la mitad» guarda `actions` y `preset` y conserva los textos', () => {
    const onCambiar = jest.fn();
    const conTexto = leerAccionesFicha({}).acciones.map((a) => (a.tipo === 'comprar' ? { ...a, texto: 'Comprar ya' } : a));
    render(<EditorAccionesFicha contenido={{ actions: conTexto, sticky_mobile: false }} onCambiar={onCambiar} numeroWhatsapp="3001234567" />);
    fireEvent.click(screen.getByRole('radio', { name: /Dos a la mitad/ }));
    const c = ultimo(onCambiar);
    expect(c.preset).toBe('dos_mitad');
    expect(c.sticky_mobile).toBe(false);
    expect((c.actions as AccionFicha[]).find((a) => a.tipo === 'comprar')).toMatchObject({ tamano: 'mitad', texto: 'Comprar ya' });
  });

  test('«Agregar al carrito» no se puede ocultar; WhatsApp sí se muestra', () => {
    const onCambiar = jest.fn();
    render(<EditorAccionesFicha contenido={{}} onCambiar={onCambiar} numeroWhatsapp="3001234567" />);
    const ojoAgregar = screen.getByRole('button', { name: /«Agregar al carrito» no se puede ocultar/ });
    expect(ojoAgregar.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar Pedir por WhatsApp' }));
    const c = ultimo(onCambiar);
    expect((c.actions as AccionFicha[]).find((a) => a.tipo === 'whatsapp')!.visible).toBe(true);
    expect(c.preset).toBe('personalizada');
  });

  test('WhatsApp visible sin número: aviso con enlace a Configuración › Contacto', () => {
    render(<EditorAccionesFicha contenido={{ preset: 'con_whatsapp' }} onCambiar={jest.fn()} numeroWhatsapp="" />);
    expect(screen.getByText('WhatsApp no tiene número')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ir a Contacto/ }).getAttribute('href')).toBe('/app/sitio-web/configuracion');
  });

  test('con número no hay aviso', () => {
    render(<EditorAccionesFicha contenido={{ preset: 'con_whatsapp' }} onCambiar={jest.fn()} numeroWhatsapp="+57 300 123 4567" />);
    expect(screen.queryByText('WhatsApp no tiene número')).toBeNull();
  });

  test('abrir un botón: tamaño, estilo y texto; vaciar el texto vuelve al de por defecto', () => {
    const onCambiar = jest.fn();
    render(<EditorAccionesFicha contenido={{ actions: DISTRIBUCIONES.clasica.map((a) => (a.tipo === 'comprar' ? { ...a, texto: 'Ya' } : a)) }} onCambiar={onCambiar} numeroWhatsapp="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Opciones de Comprar ahora' }));
    const panel = screen.getByText('Texto del botón').closest('div')!.parentElement!;
    fireEvent.click(within(panel).getByRole('radio', { name: 'Mitad' }));
    expect((ultimo(onCambiar).actions as AccionFicha[]).find((a) => a.tipo === 'comprar')!.tamano).toBe('mitad');
    const campo = screen.getByLabelText('Texto del botón') as HTMLInputElement;
    expect(campo.placeholder).toBe('Comprar ahora');
    fireEvent.change(campo, { target: { value: '' } });
    expect((ultimo(onCambiar).actions as AccionFicha[]).find((a) => a.tipo === 'comprar')!.texto).toBeUndefined();
  });

  test('en inglés los textos salen traducidos', () => {
    render(<EditorAccionesFicha contenido={{}} onCambiar={jest.fn()} numeroWhatsapp="" />, { idioma: 'en' });
    expect(screen.getByRole('radio', { name: /Two halves/ })).toBeTruthy();
    expect(screen.getByText('Buttons and order')).toBeTruthy();
  });
});

describe('Inspector de la sección «Acciones de producto»', () => {
  const seccion = {
    id: 'acciones-1',
    page_id: 'p',
    section_type: 'product_actions',
    section_variant: 'default',
    content: { position: 'sticky', buttons: [{ label: 'Viejo' }], buttons_layout: 'inline' },
    settings: {},
    sort_order: 3,
    is_visible: true,
  } as unknown as WebsitePageSection;

  const props = {
    seccion,
    enBorrador: true,
    onCambiarVariante: jest.fn(),
    onCambiarEstilo: jest.fn(),
    onCambiarVisibilidad: jest.fn(),
    onAlternarVisible: jest.fn(),
    onDuplicar: jest.fn(),
    onEliminar: jest.fn(),
    tema: { colores: {}, fuentes: [] } as never,
    catalogoFuentes: [],
    categorias: { lista: [], cargando: false },
    entornoEspacio: { primera: false, ajustesSitio: { whatsapp_number: '3001234567' } },
  };

  test('abre en Contenido con el editor nuevo; lo guardado viejo se lee («inline» = Dos a la mitad) y se conserva al guardar', () => {
    const onCambiarContenido = jest.fn();
    render(<InspectorSeccion {...props} onCambiarContenido={onCambiarContenido} />);
    expect(screen.getByText('Distribución lista')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Dos a la mitad/ }).getAttribute('aria-checked')).toBe('true');
    // Ni «Posición de botones» ni «Botones personalizados»; sí la barra fija y el precio en el botón.
    expect(screen.queryByText('Posición de botones')).toBeNull();
    expect(screen.queryByText('Botones personalizados')).toBeNull();
    expect(screen.getByText('Barra fija en el celular')).toBeTruthy();
    expect(screen.getByText('Precio dentro del botón')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Compacta/ }));
    const c = ultimo(onCambiarContenido);
    expect(c).toMatchObject({ preset: 'compacta', position: 'sticky', buttons_layout: 'inline' });
  });
});

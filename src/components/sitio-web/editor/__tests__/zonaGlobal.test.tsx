/**
 * @jest-environment jsdom
 *
 * Paneles «Encabezado» y «Pie de página» del editor (Figma 2058:40377 y 2064:102): lógica pura
 * (defaults del contrato, barra móvil, anuncios, restablecer, guardado legacy) y los paneles con
 * sus tres pestañas, cada opción del contrato editable. Datos ficticios.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';
import { shellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import {
  BREAKPOINT_MOVIL_SITIO,
  cambiosParaFilaLegacy,
  cambiosRestablecer,
  escribirAnuncios,
  esVistaMovil,
  leerAnuncios,
  leerBarraMovil,
  opcionBooleana,
  opcionesDestino,
  valorBarraMovil,
} from '../inspector/zonaGlobalLogica';
import { InspectorEncabezado } from '../inspector/InspectorEncabezado';
import { InspectorPie } from '../inspector/InspectorPie';

jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const SLUGS = ['home', 'menu', 'domicilios', 'reservas-mesa', 'nosotros', 'contacto', 'galeria', 'terminos', 'privacidad'];
const NOIR = shellPorDefecto('noir_omakase', 'restaurante', SLUGS);
const COLORES = { fondo: '#0E0E0E', texto: '#F5F1EA', acento: '#C8A97E' };

describe('zonaGlobalLogica', () => {
  test('el corte celular/computador es el del sitio (1024): la tableta ve el menú del celular', () => {
    expect(BREAKPOINT_MOVIL_SITIO).toBe(1024);
    expect(esVistaMovil('celular')).toBe(true);
    expect(esVistaMovil('tableta')).toBe(true);
    expect(esVistaMovil('portatil')).toBe(false);
    expect(esVistaMovil('escritorio')).toBe(false);
  });

  test('carrito y cuenta: sin valor guardado salen ENCENDIDOS, como en el sitio y la base', () => {
    expect(opcionBooleana({}, 'show_header_cart')).toBe(true);
    expect(opcionBooleana({}, 'show_header_auth')).toBe(true);
    expect(opcionBooleana({ show_header_cart: false }, 'show_header_cart')).toBe(false);
    expect(opcionBooleana({}, 'header_show_branch_selector')).toBe(false);
  });

  test('anuncios: lista en JSON, texto suelto y vacío', () => {
    expect(leerAnuncios('["Hoy abrimos a las 10"]')).toEqual(['Hoy abrimos a las 10']);
    expect(leerAnuncios('Texto suelto')).toEqual(['Texto suelto']);
    expect(leerAnuncios(null)).toEqual([]);
    expect(escribirAnuncios(['a', '  '])).toBe('["a"]');
    expect(escribirAnuncios(['  '])).toBeNull();
  });

  test('barra móvil: auto, ninguna, lista; una acción en la columna legacy se lee como lista', () => {
    expect(leerBarraMovil({})).toEqual({ modo: 'auto', acciones: [] });
    expect(leerBarraMovil({ mobile_bottom_bar: 'ninguna' }).modo).toBe('ninguna');
    expect(leerBarraMovil({ mobile_bottom_bar: 'reservar,llamar' })).toEqual({ modo: 'lista', acciones: ['reservar', 'llamar'] });
    expect(leerBarraMovil({ mobile_bottom_bar: 'reservar' })).toEqual({ modo: 'lista', acciones: ['reservar'] });
    expect(valorBarraMovil('lista', [], 'hotel')).toEqual(['reservar', 'llamar', 'como_llegar']);
    expect(valorBarraMovil('lista', ['llamar', 'llamar', 'whatsapp', 'pedir', 'reservar', 'agendar'], null)).toEqual(['llamar', 'whatsapp', 'pedir', 'reservar']);
    expect(valorBarraMovil('auto', ['llamar'], null)).toBe('auto');
  });

  test('destinos del botón: páginas (sin las de sistema), rutas del sitio, WhatsApp y mapa', () => {
    const o = opcionesDestino(
      [
        { slug: 'home', titulo: 'Inicio' },
        { slug: 'reservas-mesa', titulo: 'Reservar mesa' },
        { slug: 'plantillas/cart', titulo: 'Carrito' },
      ],
      { pagina: (t) => `Página · ${t}`, whatsapp: 'WhatsApp', maps: 'Mapa' },
    );
    expect(o.map((x) => x.valor)).toEqual(['/', '/reservas-mesa', '/reservas', '/agendar', '/consultar-pedido', '/mi-cuenta', 'whatsapp', 'maps']);
  });

  test('restablecer: cada opción de la zona vuelve a la plantilla o a su default, con la composición', () => {
    const c = cambiosRestablecer('header', NOIR.header);
    expect(c.header_style).toBe('default');
    expect(c).toMatchObject({ logo_position: 'center', header_cta_text: 'Reservar mesa', header_cta_url: '/reservas-mesa', show_header_cart: false });
    expect(c.header_cta2_text).toBeNull();
    for (const [k, def] of Object.entries(OPCIONES_SHELL)) if (def.zona === 'header') expect(k in c).toBe(true);
    expect(Object.keys(c).some((k) => OPCIONES_SHELL[k]?.zona === 'footer')).toBe(false);
  });

  test('legacy: no envía una columna nueva que la fila no trae y la barra móvil va como texto', () => {
    const fila = { show_topbar: true, mobile_bottom_bar: 'auto' };
    const r = cambiosParaFilaLegacy({ show_topbar: false, footer_show_map: true, mobile_bottom_bar: ['reservar', 'llamar'] }, fila);
    expect(r.enviar).toEqual({ show_topbar: false, mobile_bottom_bar: 'reservar,llamar' });
    expect(r.omitidas).toEqual(['footer_show_map']);
    // Con la migración aplicada (la fila trae la columna), se envía.
    expect(cambiosParaFilaLegacy({ footer_show_map: true }, { footer_show_map: false }).enviar).toEqual({ footer_show_map: true });
  });
});

function encabezado(ajustes: Record<string, unknown> = {}, extra: Partial<React.ComponentProps<typeof InspectorEncabezado>> = {}) {
  const onCambiar = jest.fn();
  renderConIdioma(
    <InspectorEncabezado
      ajustes={{ header_style: 'default', header_menu_id: 'm1', ...ajustes }}
      onCambiar={onCambiar}
      menus={[{ id: 'm1', name: 'Principal', enlaces: 6 }]}
      paginas={SLUGS.map((s) => ({ slug: s, titulo: s }))}
      porDefecto={NOIR}
      enBorrador
      dispositivo="escritorio"
      coloresTema={COLORES}
      onEditarMenu={jest.fn()}
      onCerrar={jest.fn()}
      {...extra}
    />,
  );
  return onCambiar;
}

describe('InspectorEncabezado', () => {
  test('cabecera, pestañas Contenido / Diseño / Estilo y Diseño con la plantilla, composiciones y logo', () => {
    const onCambiar = encabezado();
    expect(screen.getByRole('heading', { name: 'Encabezado' })).toBeTruthy();
    expect(screen.getByText('Global · aparece en todas las páginas')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Contenido', 'Diseño', 'Estilo']);
    expect(screen.getByText('Cambia en todas las páginas')).toBeTruthy();
    expect(screen.getByText('Valores por defecto de la plantilla «Noir Omakase»')).toBeTruthy();
    const composiciones = screen.getByRole('radiogroup', { name: 'Diseño del encabezado' });
    expect(within(composiciones).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Clásico', 'Logo centrado', 'Dividido', 'Mínimo', 'Megamenú']);
    fireEvent.click(within(composiciones).getByRole('radio', { name: 'Megamenú' }));
    expect(onCambiar).toHaveBeenCalledWith({ header_style: 'mega' });
    fireEvent.click(screen.getByRole('radio', { name: 'Centro' }));
    expect(onCambiar).toHaveBeenCalledWith({ logo_position: 'center' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Buscador · celular' })).getByRole('radio', { name: 'Barra bajo el logo' }));
    expect(onCambiar).toHaveBeenCalledWith({ mobile_search_style: 'bar' });
  });

  test('Contenido: carrito y cuenta encendidos por defecto; segundo botón, barra superior, sede e idioma deshabilitado', () => {
    const onCambiar = encabezado({ show_topbar: true }, { pestanaInicial: 'contenido' });
    expect(screen.getByRole('switch', { name: 'Carrito' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Cuenta' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar segundo botón/ }));
    expect(onCambiar).toHaveBeenCalledWith({ header_cta2_text: 'WhatsApp', header_cta2_url: 'whatsapp' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sede y horario' }));
    expect(onCambiar).toHaveBeenCalledWith({ topbar_show_branch_status: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Envío gratis' }));
    expect(onCambiar).toHaveBeenCalledWith({ topbar_show_free_shipping: true });
    expect((screen.getByRole('checkbox', { name: 'Idioma' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: /Selector de sede en el encabezado/ }));
    expect(onCambiar).toHaveBeenCalledWith({ header_show_branch_selector: true });
    fireEvent.click(screen.getByRole('switch', { name: /Barra de reserva con fechas/ }));
    expect(onCambiar).toHaveBeenCalledWith({ header_booking_bar: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Buscador' }));
    expect(onCambiar).toHaveBeenCalledWith({ search_style: 'hidden' });
    fireEvent.click(screen.getByRole('radio', { name: 'Categorías de la carta' }));
    expect(onCambiar).toHaveBeenCalledWith({ header_menu_source: 'categorias_carta' });
  });

  test('Estilo: sigue el tema o fija color, transparencia sobre la portada y restablecer', () => {
    const onCambiar = encabezado({}, { pestanaInicial: 'estilo' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fondo' })).getByRole('radio', { name: 'Fijar color' }));
    expect(onCambiar).toHaveBeenCalledWith({ header_bg_color: '#0E0E0E' });
    fireEvent.click(screen.getByRole('switch', { name: /Sobre la portada, sólido al bajar/ }));
    expect(onCambiar).toHaveBeenCalledWith({ header_style: 'transparent' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Restablecer a la plantilla' })[0]);
    expect(onCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ header_style: 'default', logo_position: 'center', header_cta_text: 'Reservar mesa' }));
  });
});

describe('InspectorPie', () => {
  const pie = (ajustes: Record<string, unknown> = {}, extra: Partial<React.ComponentProps<typeof InspectorPie>> = {}) => {
    const onCambiar = jest.fn();
    renderConIdioma(
      <InspectorPie
        ajustes={{ footer_style: 'default', ...ajustes }}
        onCambiar={onCambiar}
        menusPie={[
          { id: 'a', nombre: 'Ayuda' },
          { id: 'l', nombre: 'Legales' },
        ]}
        porDefecto={NOIR}
        enBorrador
        giro="restaurante"
        coloresTema={COLORES}
        onEditarMenus={jest.fn()}
        onAnadirMenu={jest.fn()}
        onQuitarMenu={jest.fn()}
        onCerrar={jest.fn()}
        {...extra}
      />,
    );
    return onCambiar;
  };

  test('Contenido: menús por columna y qué mostrar (WhatsApp, mapa y medios de pago nuevos)', () => {
    const onCambiar = pie();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Contenido', 'Diseño', 'Estilo']);
    expect(screen.getByText('columna 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Añadir menú' })).toBeTruthy();
    for (const [nombre, clave] of [
      [/Botón de WhatsApp/, 'footer_show_whatsapp'],
      [/Mapa «Cómo llegar»/, 'footer_show_map'],
      [/Medios de pago/, 'footer_show_payment_methods'],
    ] as const) {
      fireEvent.click(screen.getByRole('switch', { name: nombre }));
      expect(onCambiar).toHaveBeenCalledWith({ [clave]: true });
    }
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(3);
  });

  test('Diseño: composiciones, columnas, celular y barra fija abajo con acciones', () => {
    const onCambiar = pie({ mobile_bottom_bar: 'reservar,llamar' }, { pestanaInicial: 'diseno', giro: 'hotel' });
    const comp = screen.getByRole('radiogroup', { name: 'Diseño del pie' });
    expect(within(comp).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Clásico', '3 columnas', 'Centrado', 'Mínimo', 'Dividido']);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Columnas' })).getByRole('radio', { name: '3' }));
    expect(onCambiar).toHaveBeenCalledWith({ footer_columns: 3 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cómo llegar' }));
    expect(onCambiar).toHaveBeenCalledWith({ mobile_bottom_bar: ['reservar', 'llamar', 'como_llegar'] });
    fireEvent.click(screen.getByRole('switch', { name: /Barra fija abajo/ }));
    expect(onCambiar).toHaveBeenCalledWith({ mobile_bottom_bar: 'ninguna' });
  });

  test('Estilo: fondo «Tema» y personalizado con color', () => {
    const onCambiar = pie({}, { pestanaInicial: 'estilo' });
    fireEvent.click(screen.getByRole('radio', { name: 'Tema' }));
    expect(onCambiar).toHaveBeenCalledWith({ footer_background: 'tema' });
    fireEvent.click(screen.getByRole('radio', { name: 'Personalizado' }));
    expect(onCambiar).toHaveBeenCalledWith({ footer_background: 'custom', footer_custom_bg_color: '#F5F1EA' });
  });
});

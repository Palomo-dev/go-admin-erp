/**
 * @jest-environment jsdom
 *
 * «Ficha de producto › Información del producto › Etiquetas» (Figma 3040:78682): abrir no escribe
 * nada (la ficha de hoy), encender escribe `labels_show: true`, cambiar la ubicación, apagar quita
 * `labels_show`, «Volver al aspecto de hoy» quita todas las claves, las etiquetas propias reutilizan
 * el editor de la tarjeta, el inspector de `product_info` monta el panel en Contenido y los cambios
 * de estas claves no recargan el lienzo. Textos reales (messages/*.json).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { EditorEtiquetasFicha } from '../EditorEtiquetasFicha';
import { InspectorSeccion } from '../InspectorSeccion';
import { cambioPideRecargaLienzo } from '../../recargaLienzoDetalle';
import { TIPOS_ETIQUETA_FICHA } from '@/lib/website/v2/seccionesFicha';
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
const BLOQUES = { blocks: [{ id: 'title', visible: true }] };
const ENCENDIDO = { ...BLOQUES, labels_show: true };

describe('Panel «Etiquetas» de la ficha', () => {
  test('apagado: no escribe al abrir, solo el interruptor y sin «Volver al aspecto de hoy»', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={BLOQUES} onCambiar={onCambiar} />);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByText('Etiquetas')).toBeTruthy();
    expect(screen.getByText('Nuevo')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Mostrar etiquetas en la ficha' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Dónde se ven')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Volver al aspecto de hoy' })).toBeNull();
  });

  test('encender escribe `labels_show: true` y conserva el contenido', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={BLOQUES} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar etiquetas en la ficha' }));
    expect(ultimo(onCambiar)).toEqual({ ...BLOQUES, labels_show: true });
  });

  test('encendido: «Junto al título» por defecto; elegir «Ambas» escribe la ubicación', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={onCambiar} />);
    expect(screen.getByRole('radio', { name: 'Junto al título' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Ambas' }));
    expect(ultimo(onCambiar)).toEqual({ ...ENCENDIDO, labels_placement: 'ambas' });
  });

  test('«Cuáles»: los 8 tipos con su muestra; apagar uno guarda la lista en orden', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={onCambiar} />);
    const lista = screen.getByRole('list', { name: 'Cuáles' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(TIPOS_ETIQUETA_FICHA.length);
    expect(lista.textContent).toMatch(/Envío gratis.*Descuento.*-20 %.*Promociones \(2 X 1, 3 X 2…\).*2 X 1.*Precio por volumen.*Desde 3: −10 %.*776 vendidos/);
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar «Descuento»' }));
    const items = ultimo(onCambiar).labels_items as Array<Record<string, unknown>>;
    expect(items.map((i) => i.id)).toEqual([...TIPOS_ETIQUETA_FICHA]);
    expect(items[1]).toEqual({ id: 'discount', visible: false });
  });

  test('abrir una fila: esquina y colores; «Bajar» cambia el orden', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={{ ...ENCENDIDO, labels_placement: 'foto' }} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Opciones de «Promociones (2 X 1, 3 X 2…)»' }));
    const esquina = screen.getByRole('radiogroup', { name: 'Esquina sobre la foto' });
    expect(within(esquina).getByRole('radio', { name: 'Arriba derecha' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(esquina).getByRole('radio', { name: 'Abajo derecha' }));
    expect((ultimo(onCambiar).labels_items as unknown[])[2]).toEqual({ id: 'promotion', corner: 'bottom_right' });
    expect(screen.getAllByRole('radio', { name: 'De la tarjeta' }).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'Bajar' }));
    expect((ultimo(onCambiar).labels_items as Array<{ id: string }>).map((i) => i.id).slice(0, 4)).toEqual(['free_shipping', 'discount', 'volume', 'promotion']);
  });

  test('Estilo: «De la tarjeta» no escribe la clave; otra forma sí', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={{ ...ENCENDIDO, labels_shape: 'square' }} onCambiar={onCambiar} />);
    const forma = screen.getByRole('radiogroup', { name: 'Forma' });
    fireEvent.click(within(forma).getByRole('radio', { name: 'Píldora' }));
    expect(ultimo(onCambiar)).toEqual({ ...ENCENDIDO, labels_shape: 'pill' });
    fireEvent.click(within(forma).getByRole('radio', { name: 'De la tarjeta' }));
    expect(ultimo(onCambiar)).toEqual(ENCENDIDO);
  });

  test('apagar quita `labels_show` (conserva lo demás); «Volver al aspecto de hoy» quita todas las claves', () => {
    const onCambiar = jest.fn();
    const guardado = { ...ENCENDIDO, labels_placement: 'foto', labels_size: 'sm', labels_custom: [] };
    render(<EditorEtiquetasFicha contenido={guardado} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar etiquetas en la ficha' }));
    expect(ultimo(onCambiar)).toEqual({ ...BLOQUES, labels_placement: 'foto', labels_size: 'sm', labels_custom: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al aspecto de hoy' }));
    expect(ultimo(onCambiar)).toEqual(BLOQUES);
  });

  test('etiquetas propias: por defecto las del sitio; al apagar copia las del sitio y reutiliza el editor de la tarjeta', () => {
    const onCambiar = jest.fn();
    const sitio = { labels_custom: [{ id: 'o', label: 'Originales', bg: '#111827' }, { id: 'x', label: '' }] };
    const { rerender } = render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={onCambiar} estiloTarjetaSitio={sitio} />);
    const usar = screen.getByRole('switch', { name: 'Usar las del estilo de tarjeta' });
    expect(usar.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Agregar etiqueta' })).toBeNull();
    fireEvent.click(usar);
    expect(ultimo(onCambiar)).toEqual({ ...ENCENDIDO, labels_custom: [{ id: 'o', label: 'Originales', bg: '#111827' }] });

    rerender(<EditorEtiquetasFicha contenido={{ ...ENCENDIDO, labels_custom: [{ id: 'o', label: 'Originales' }] }} onCambiar={onCambiar} estiloTarjetaSitio={sitio} />);
    // El editor de «Estilo de tarjeta › Etiquetas propias» (EtiquetasPropiasTarjeta).
    expect(document.querySelector('[data-bloque="etiquetas-propias"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));
    expect(ultimo(onCambiar).labels_custom).toEqual([{ id: 'o', label: 'Originales' }, { id: 'et2', label: 'Nueva etiqueta' }]);
    fireEvent.click(screen.getByRole('switch', { name: 'Usar las del estilo de tarjeta' }));
    expect(ultimo(onCambiar)).toEqual(ENCENDIDO);
  });

  test('sin etiquetas propias en el sitio, apagar deja una lista propia vacía', () => {
    const onCambiar = jest.fn();
    render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Usar las del estilo de tarjeta' }));
    expect(ultimo(onCambiar)).toEqual({ ...ENCENDIDO, labels_custom: [] });
  });

  test('enlace a Estilo de tarjeta: botón si hay cómo navegar; si no, texto', () => {
    const abrir = jest.fn();
    const { rerender } = render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={jest.fn()} onAbrirEstiloTarjeta={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Colores y textos en Estilo de tarjeta' }));
    expect(abrir).toHaveBeenCalledTimes(1);
    rerender(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Colores y textos en Estilo de tarjeta' })).toBeNull();
    expect(screen.getByText('Colores y textos en Estilo de tarjeta ›')).toBeTruthy();
  });

  test.each(['en', 'fr', 'pt'] as const)('textos en %s', (idioma) => {
    render(<EditorEtiquetasFicha contenido={ENCENDIDO} onCambiar={jest.fn()} />, { idioma });
    expect(screen.queryByText(/sitioWeb\.editor\.etiquetasFicha/)).toBeNull();
  });
});

describe('Inspector de «Información del producto»', () => {
  const seccion = {
    id: 's-info',
    page_id: 'p',
    section_type: 'product_info',
    section_variant: 'default',
    content: BLOQUES,
    settings: {},
    sort_order: 2,
    is_visible: true,
  } as unknown as WebsitePageSection;

  test('la pestaña Contenido monta el panel «Etiquetas» y encender escribe en el contenido del bloque', () => {
    const onCambiarContenido = jest.fn();
    render(
      <InspectorSeccion
        seccion={seccion}
        enBorrador
        pestanaInicial="contenido"
        onCambiarContenido={onCambiarContenido}
        onCambiarVariante={jest.fn()}
        onCambiarEstilo={jest.fn()}
        onCambiarVisibilidad={jest.fn()}
        onAlternarVisible={jest.fn()}
        onDuplicar={jest.fn()}
        onEliminar={jest.fn()}
        tema={{ colores: {}, fuentes: [] } as never}
        catalogoFuentes={[]}
        categorias={{ lista: [], cargando: false }}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar etiquetas en la ficha' }));
    expect(ultimo(onCambiarContenido)).toEqual({ ...BLOQUES, labels_show: true });
  });
});

describe('Lienzo de la ficha', () => {
  test('las claves de etiquetas de `product_info` no recargan el lienzo (van por el puente en vivo)', () => {
    const info = { id: 's-info', tipo: 'product_info', variante: 'default', contenido: BLOQUES, visibilidad: undefined };
    const look = { id: 's-look', tipo: 'complete_the_look', variante: 'default', contenido: { source: 'tag' }, visibilidad: undefined };
    const despues = { ...info, contenido: { ...BLOQUES, labels_show: true, labels_placement: 'ambas', labels_items: [{ id: 'promotion' }], labels_custom: [] } };
    expect(cambioPideRecargaLienzo('product_detail', { secciones: [info, look] } as never, { secciones: [despues, look] } as never)).toBe(false);
  });
});

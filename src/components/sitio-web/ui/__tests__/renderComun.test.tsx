/**
 * @jest-environment jsdom
 *
 * Render de los componentes comunes del módulo Sitio web (Figma A/07, B/02,
 * D/02) y de las piezas nuevas del kit que usan (SettingsSaveBar,
 * ConfirmDialog, AvisoTonal, TarjetaSeleccionable).
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { PublishStatusBadge } from '../PublishStatusBadge';
import { ChecklistItem } from '../ChecklistItem';
import { SortableRow } from '../SortableRow';
import { ColorField } from '../ColorField';
import { DomainStatusBadge } from '../DomainStatusBadge';
import { DnsRecordRow } from '../DnsRecordRow';
import { PriceTag } from '../PriceTag';
import { ProviderGuideTabs } from '../ProviderGuideTabs';
import { StylePresetCard } from '../StylePresetCard';
import { TemplateCard } from '../TemplateCard';
import { SectionThumbnail } from '../SectionThumbnail';
import { InheritanceTag } from '../InheritanceTag';
import { FontPairOption } from '../FontPairOption';
import { SitePreview } from '../SitePreview';
import { DevicePreviewFrame } from '../DevicePreviewFrame';
import { SiteFooterPreview } from '../SiteFooterPreview';
import { SettingsSaveBar } from '@/components/kit/SettingsSaveBar';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/sitio-web' }));

describe('PublishStatusBadge (A/07a)', () => {
  test.each([
    [{ tipo: 'publicado' as const }, 'Publicado'],
    [{ tipo: 'cambios' as const, cantidad: 3 }, '3 cambios sin publicar'],
    [{ tipo: 'cambios' as const, cantidad: 1 }, '1 cambio sin publicar'],
    [{ tipo: 'borrador' as const }, 'Guardado en borrador'],
    [{ tipo: 'guardando' as const }, 'Guardando…'],
    [{ tipo: 'sin_publicar' as const }, 'Sin publicar'],
    [{ tipo: 'error' as const }, 'No se pudo publicar'],
  ])('%o → «%s»', (estado, texto) => {
    renderConIdioma(<PublishStatusBadge estado={estado} />);
    expect(screen.getByRole('status').textContent).toBe(texto);
  });

  test('programado: la fecha va en la zona de la organización', () => {
    renderConIdioma(<PublishStatusBadge estado={{ tipo: 'programado', fecha: '2026-10-08T12:00:00Z' }} />);
    // 12:00 UTC = 7:00 a. m. en Bogotá (respaldo de zona).
    expect(screen.getByRole('status').textContent).toMatch(/^Programado · 8.*oct.*7:00/);
  });
});

describe('ChecklistItem (A/07b)', () => {
  test('listo, actual y pendiente', () => {
    const onClick = jest.fn();
    renderConIdioma(
      <ol>
        <ChecklistItem titulo="Plantilla" detalle="Noir Omakase" estado="listo" />
        <ChecklistItem titulo="Pagos en línea" estado="actual" accion={{ onClick }} />
        <ChecklistItem titulo="Publicar" estado="pendiente" accion={{ href: '/app/sitio-web' }} />
      </ol>,
    );
    expect(screen.getByText('Listo')).toBeTruthy();
    const actual = screen.getByText('Pagos en línea').closest('li')!;
    expect(actual.getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Configurar' }).getAttribute('href')).toBe('/app/sitio-web');
  });
});

describe('SortableRow (A/07c)', () => {
  test('ojo, Alt + flechas y global sin acciones', () => {
    const onAlternar = jest.fn();
    const onMover = jest.fn();
    const { container } = renderConIdioma(
      <SortableRow etiqueta="Carta destacada" onAlternarVisible={onAlternar} onMover={onMover} onSeleccionar={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar «Carta destacada»' }));
    expect(onAlternar).toHaveBeenCalled();
    fireEvent.keyDown(container.firstChild as Element, { key: 'ArrowDown', altKey: true });
    expect(onMover).toHaveBeenCalledWith(1);
  });

  test('global: candado y «Global», sin ojo', () => {
    renderConIdioma(<SortableRow etiqueta="Encabezado" global onAlternarVisible={() => {}} />);
    expect(screen.getByText('Global')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ocultar/ })).toBeNull();
  });
});

describe('ColorField (A/07e)', () => {
  test('aviso AA con sugerido y «Corregir automáticamente»', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<ColorField etiqueta="Acento" valor="#C8A97E" fondo="#FFFFFF" onCambiar={onCambiar} />);
    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toMatch(/Contraste 2,\d:1 con el fondo\. Mínimo 4,5:1 \(AA\)\. Sugerido: #[0-9A-F]{6}\./);
    fireEvent.click(screen.getByRole('button', { name: 'Corregir automáticamente' }));
    expect(onCambiar).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9A-F]{6}$/));
  });

  test('foco: colores del logo y chip de contraste bien', () => {
    renderConIdioma(<ColorField etiqueta="Texto" valor="#111111" fondo="#FFFFFF" coloresLogo={['#111111', '#C8A97E']} onCambiar={() => {}} />);
    fireEvent.focus(screen.getByLabelText('Texto'));
    expect(screen.getByText('Colores de tu logo')).toBeTruthy();
    expect(screen.getByText(/Contraste 18,\d:1 con el fondo · AAA/)).toBeTruthy();
  });

  test('hex inválido avisa y no propaga', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<ColorField etiqueta="Fondo" valor="#FFFFFF" onCambiar={onCambiar} />);
    fireEvent.change(screen.getByLabelText('Fondo'), { target: { value: '#ZZZ' } });
    expect(screen.getByText(/Escribe el color como #RRGGBB/)).toBeTruthy();
    expect(onCambiar).not.toHaveBeenCalled();
  });
});

describe('Dominios (B/02)', () => {
  test('DomainStatusBadge: «Vence en 12 días»', () => {
    renderConIdioma(<DomainStatusBadge estado="vence_pronto" diasParaVencer={12} />);
    expect(screen.getByText('Vence en 12 días')).toBeTruthy();
  });

  test('DnsRecordRow: valor encontrado y copiar', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderConIdioma(<DnsRecordRow tipo="A" nombre="@" valor="76.76.21.21" estado="otro_valor" valorEncontrado="1.2.3.4" />);
    expect(screen.getByText('Encontramos 1.2.3.4')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar 76\.76\.21\.21/ }));
    });
    expect(writeText).toHaveBeenCalledWith('76.76.21.21');
    expect(screen.getByText('Copiado')).toBeTruthy();
  });

  test('PriceTag: precio y renovación', () => {
    renderConIdioma(<PriceTag moneda="COP" valor={89900} renovacion={89900} mostrarRenovacionSiempre tamano="lg" />);
    expect(screen.getAllByText(/89\.900/)[0].textContent).toMatch(/^\$\s89\.900$/);
    expect(screen.getByText(/Renueva a \$\s89\.900 \/ año/)).toBeTruthy();
  });

  test('ProviderGuideTabs: cambia de proveedor', () => {
    renderConIdioma(<ProviderGuideTabs enlacesGuia={{ cloudflare: 'https://ayuda.goadmin.io/dns/cloudflare' }} />);
    expect(screen.getByText(/Entra a GoDaddy/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Cloudflare/ }));
    expect(screen.getByText(/deja la nube en gris/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver guía con capturas en Cloudflare' })).toBeTruthy();
  });
});

describe('Diseño (A/07d, h, i, j)', () => {
  test('StylePresetCard y FontPairOption son radios con su estado', () => {
    renderConIdioma(
      <div role="radiogroup" aria-label="Estilo">
        <StylePresetCard
          nombre="Noir Omakase"
          fuentes="Cormorant · Inter"
          muestra={{ fondo: '#111', texto: '#fff', acento: '#C8A97E', textoAcento: '#111', fuenteTitulos: 'serif', radioBoton: 2 }}
          seleccionado
          onSeleccionar={() => {}}
        />
        <FontPairOption titulos="Cormorant" texto="Inter" descripcion="Elegante · títulos con serifa" seleccionado={false} onSeleccionar={() => {}} />
      </div>,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].textContent).toContain('Cocina de autor');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
  });

  test('TemplateCard: chip, secciones e insignia', () => {
    renderConIdioma(<TemplateCard nombre="Noir Omakase" giro="Restaurante" secciones={7} seleccionada rol="radio" />);
    expect(screen.getByText('Restaurante')).toBeTruthy();
    expect(screen.getByText('7 secciones')).toBeTruthy();
    expect(screen.getByText('Seleccionada')).toBeTruthy();
    renderConIdioma(<TemplateCard nombre="Contacto" modo="pagina" secciones={1} enUso />);
    expect(screen.getByText('Página')).toBeTruthy();
    expect(screen.getByText('1 sección')).toBeTruthy();
    expect(screen.getByText('En uso')).toBeTruthy();
  });

  test('SectionThumbnail: nombre por tipo y «Añadir sección»', () => {
    renderConIdioma(<SectionThumbnail tipo="ubicacion_horario" onSeleccionar={() => {}} seleccionada />);
    expect(screen.getByRole('button', { name: 'Ubicación y horario' }).getAttribute('aria-pressed')).toBe('true');
    renderConIdioma(<SectionThumbnail tipo="anadir" />);
    expect(screen.getByText('Añadir sección')).toBeTruthy();
  });
});

describe('Sedes y vista previa (D/02, A/07f, A/07g)', () => {
  test('InheritanceTag personalizado restablece', () => {
    const onRestablecer = jest.fn();
    renderConIdioma(<InheritanceTag origen="personalizado" onRestablecer={onRestablecer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer desde el sitio principal' }));
    expect(onRestablecer).toHaveBeenCalled();
  });

  test('SitePreview vacía y DevicePreviewFrame con host', () => {
    renderConIdioma(
      <DevicePreviewFrame dispositivo="escritorio" host="tu-marca.goadmin.io">
        <SitePreview url={null} />
      </DevicePreviewFrame>,
    );
    expect(screen.getByText('tu-marca.goadmin.io')).toBeTruthy();
    expect(screen.getByText(/Aún no hay nada que mostrar/)).toBeTruthy();
  });

  test('SitePreview con URL: iframe sin foco en miniatura', () => {
    const { container } = renderConIdioma(<SitePreview url="https://tu-marca.goadmin.io/?preview=t" />);
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('tabindex')).toBe('-1');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
  });

  test('SiteFooterPreview cierra con «Hecho con GO Admin»', () => {
    renderConIdioma(
      <SiteFooterPreview disposicion="centrado" marca={{ nombre: 'Tu marca' }} columnas={[]} enlaces={['Inicio', 'Carta']} anio={2026} />,
    );
    expect(screen.getByText('Hecho con GO Admin')).toBeTruthy();
  });
});

describe('Kit: barra de guardado, confirmación, aviso y tarjeta', () => {
  test('SettingsSaveBar: oculta sin cambios; Ctrl+S guarda', () => {
    const onGuardar = jest.fn();
    const { rerender } = renderConIdioma(<SettingsSaveBar cambios={0} onGuardar={onGuardar} onDescartar={() => {}} />);
    expect(screen.queryByRole('region')).toBeNull();
    rerender(<SettingsSaveBar cambios={3} onGuardar={onGuardar} onDescartar={() => {}} />);
    expect(screen.getByText('3 cambios')).toBeTruthy();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeTruthy();
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });

  test('ConfirmDialog: el primario espera el texto exacto', () => {
    const onConfirmar = jest.fn();
    renderConIdioma(
      <ConfirmDialog
        abierto
        onAbiertoChange={() => {}}
        titulo="¿Eliminar tu sitio web?"
        descripcion="Se borrarán páginas, diseño y ajustes."
        textoConfirmar="Eliminar sitio"
        confirmarCon="tu-marca"
        onConfirmar={onConfirmar}
      />,
    );
    const primario = screen.getByRole('button', { name: 'Eliminar sitio' }) as HTMLButtonElement;
    expect(primario.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Escribe «tu-marca» para confirmar'), { target: { value: 'tu-marca' } });
    expect(primario.disabled).toBe(false);
    fireEvent.click(primario);
    expect(onConfirmar).toHaveBeenCalled();
  });

  test('AvisoTonal con acción y TarjetaSeleccionable como radio', () => {
    const onClick = jest.fn();
    const onSeleccionar = jest.fn();
    renderConIdioma(
      <>
        <AvisoTonal tono="advertencia" titulo="www.tumarca.co vence en 12 días" accion={{ etiqueta: 'Renovar', onClick }} />
        <TarjetaSeleccionable titulo="Restaurante" seleccionada={false} onSeleccionar={onSeleccionar} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Renovar' }));
    expect(onClick).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Restaurante' }));
    expect(onSeleccionar).toHaveBeenCalled();
  });
});

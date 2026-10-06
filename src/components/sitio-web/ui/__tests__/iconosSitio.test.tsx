/**
 * @jest-environment jsdom
 *
 * Iconografía del módulo Sitio web: un estado = un icono, una tarea = el
 * mismo icono que su entrada del menú, y una sola escala de tamaños.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { PublishStatusBadge } from '../PublishStatusBadge';
import { ChecklistItem } from '../ChecklistItem';
import { CajaIcono } from '../CajaIcono';
import {
  CAJA_ICONO,
  CLASE_TAMANO_ICONO,
  ICONO_ESTADO_PUBLICACION,
  ICONO_TAREA_SITIO,
  TAMANO_ICONO,
  iconoGira,
  type TareaSitio,
} from '../iconosSitio';
import type { EstadoPublicacion } from '../estadoPublicacion';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

describe('escala de iconos', () => {
  test('14 / 16 / 20 / 40 px y clases coherentes', () => {
    expect(TAMANO_ICONO).toEqual({ meta: 14, base: 16, fila: 20, caja: 40 });
    // size-N de Tailwind = N × 4 px.
    for (const [k, px] of Object.entries(TAMANO_ICONO)) {
      const n = Number(CLASE_TAMANO_ICONO[k as keyof typeof TAMANO_ICONO].replace('size-', ''));
      expect(n * 4).toBe(px);
    }
    expect(CAJA_ICONO.md.px).toBe(40);
    expect(CAJA_ICONO.sm.px).toBe(32);
  });
});

describe('icono por estado de publicación', () => {
  test('cada estado tiene un icono distinto; solo «guardando» gira', () => {
    const iconos = Object.values(ICONO_ESTADO_PUBLICACION);
    expect(new Set(iconos).size).toBe(iconos.length);
    expect(iconoGira('guardando')).toBe(true);
    expect(iconoGira('publicado')).toBe(false);
  });

  test.each<[EstadoPublicacion, string]>([
    [{ tipo: 'publicado' }, 'Publicado'],
    [{ tipo: 'cambios', cantidad: 2 }, '2 cambios sin publicar'],
    [{ tipo: 'sin_publicar' }, 'Sin publicar'],
    [{ tipo: 'error' }, 'No se pudo publicar'],
  ])('%o lleva icono decorativo y el texto «%s»', (estado, texto) => {
    const { container } = renderConIdioma(<PublishStatusBadge estado={estado} />);
    expect(screen.getByRole('status').textContent).toBe(texto);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  test('guardando gira y respeta movimiento reducido', () => {
    const { container } = renderConIdioma(<PublishStatusBadge estado={{ tipo: 'guardando' }} />);
    const clase = container.querySelector('svg')!.getAttribute('class') ?? '';
    expect(clase).toContain('animate-spin');
    expect(clase).toContain('motion-reduce:animate-none');
  });

  test('indicador="punto" conserva la píldora con punto de A/07a', () => {
    const { container } = renderConIdioma(<PublishStatusBadge estado={{ tipo: 'publicado' }} indicador="punto" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.size-1\\.5')).toBeTruthy();
  });
});

describe('icono por tarea = icono del menú', () => {
  const RUTA_DE_TAREA: Partial<Record<TareaSitio, string>> = {
    plantilla: '/app/sitio-web/plantillas',
    estilo: '/app/sitio-web/diseno',
    paginas: '/app/sitio-web/paginas',
    carta: '/app/sitio-web/carta',
    catalogo: '/app/sitio-web/tienda',
    ventas: '/app/sitio-web/ventas',
    dominio: '/app/sitio-web/dominios',
    seo: '/app/sitio-web/seo',
    analitica: '/app/sitio-web/analitica',
    sedes: '/app/sitio-web/sedes',
    configuracion: '/app/sitio-web/configuracion',
  };

  test.each(Object.entries(RUTA_DE_TAREA))('%s usa el icono de %s', (tarea, ruta) => {
    const pagina = moduloPorCodigo('website')?.paginas.find((p) => p.href === ruta);
    expect(pagina).toBeTruthy();
    expect(ICONO_TAREA_SITIO[tarea as TareaSitio]).toBe(pagina!.icono);
  });

  test('«sitio» usa el icono del módulo', () => {
    expect(ICONO_TAREA_SITIO.sitio).toBe(moduloPorCodigo('website')?.icono);
  });
});

describe('CajaIcono y ChecklistItem con icono', () => {
  test('caja 40 con icono 20; caja 32 con icono 16', () => {
    const { container } = renderConIdioma(
      <>
        <CajaIcono icono={ICONO_TAREA_SITIO.dominio} />
        <CajaIcono icono={ICONO_TAREA_SITIO.pagos} tamano="sm" tono="advertencia" />
      </>,
    );
    const [md, sm] = Array.from(container.querySelectorAll('span[data-tamano]'));
    expect(md.className).toContain('size-10');
    expect(md.querySelector('svg')!.getAttribute('class')).toContain('size-5');
    expect(md.className).toContain('bg-brand-tint');
    expect(sm.className).toContain('size-8');
    expect(sm.querySelector('svg')!.getAttribute('class')).toContain('size-4');
    expect(sm.className).toContain('bg-warning-subtle');
    expect(md.getAttribute('aria-hidden')).toBe('true');
  });

  test('el paso del checklist lleva el icono de 16 de su tarea, sin caja y sin cortar el texto', () => {
    const { container } = renderConIdioma(
      <ol>
        <ChecklistItem
          titulo="Pagos en línea"
          detalle="Conecta una pasarela para cobrar en el sitio"
          estado="actual"
          icono={ICONO_TAREA_SITIO.dominio}
          accion={{ href: '/app/sitio-web/dominios' }}
        />
      </ol>,
    );
    // En la tarjeta de 312 px (A/02a a 1024) la caja de 32 dejaba 64 px de texto.
    expect(container.querySelector('span[data-tamano]')).toBeNull();
    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs.some((s) => (s.getAttribute('class') ?? '').includes('size-4'))).toBe(true);
    expect(container.innerHTML).not.toContain('truncate');
    expect(screen.getByRole('link', { name: 'Configurar' })).toBeTruthy();
  });
});

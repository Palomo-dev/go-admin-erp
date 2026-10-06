/**
 * @jest-environment jsdom
 *
 * Iconos del Resumen y del asistente: la misma tarea lleva el mismo icono en la
 * lista de lanzamiento, en el asistente, en el héroe de primera vez y en
 * «Revisar cambios», y todos salen de `iconosSitio` (ninguno se elige aquí).
 */
import { render } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { PASOS_ASISTENTE } from '@/lib/website/onboardingSitio';
import { ICONO_GIRO_SITIO, ICONO_TAREA_SITIO, ICONO_KPI_SITIO } from '../../ui/iconosSitio';
import { TAREA_DE_PASO } from '../ListaLanzamiento';
import { TAREA_DE_AREA } from '../DialogoRevisarCambios';
import { TAREA_DE_PASO_ASISTENTE, iconoPasoAsistente } from '../asistente/pasosConIcono';
import { EncabezadoPaso } from '../asistente/EncabezadoPaso';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('iconos de tarea en el Resumen y el asistente', () => {
  test('cada paso de la lista de lanzamiento tiene icono', () => {
    for (const tarea of Object.values(TAREA_DE_PASO)) expect(ICONO_TAREA_SITIO[tarea]).toBeTruthy();
  });

  test('los pasos que existen en los dos lados usan el mismo icono en el asistente y en la lista', () => {
    const comunes = { plantilla: 'plantilla', estilo: 'estilo', datos: 'datos', dominio: 'dominio', publicar: 'publicar' } as const;
    for (const [pasoAsistente, pasoLista] of Object.entries(comunes)) {
      expect(iconoPasoAsistente(pasoAsistente as (typeof PASOS_ASISTENTE)[number])).toBe(ICONO_TAREA_SITIO[TAREA_DE_PASO[pasoLista]]);
    }
  });

  test('los seis pasos del asistente tienen iconos distintos', () => {
    const iconos = PASOS_ASISTENTE.map((p) => ICONO_TAREA_SITIO[TAREA_DE_PASO_ASISTENTE[p]]);
    expect(new Set(iconos).size).toBe(PASOS_ASISTENTE.length);
  });

  test('«Otro» no repite el icono de Plantillas', () => {
    expect(ICONO_GIRO_SITIO.otro).not.toBe(ICONO_TAREA_SITIO.plantilla);
    expect(ICONO_GIRO_SITIO.restaurante).toBe(ICONO_TAREA_SITIO.carta);
    expect(ICONO_GIRO_SITIO.tienda).toBe(ICONO_TAREA_SITIO.catalogo);
  });

  test('cada área de «Revisar cambios» tiene icono y las globales no se confunden con páginas', () => {
    for (const tarea of Object.values(TAREA_DE_AREA)) expect(ICONO_TAREA_SITIO[tarea]).toBeTruthy();
    expect(ICONO_TAREA_SITIO[TAREA_DE_AREA.tema]).not.toBe(ICONO_TAREA_SITIO[TAREA_DE_AREA.pagina]);
  });

  test('«Datos del negocio» lleva en «Revisar cambios» el mismo icono que su tarea en la lista y el asistente', () => {
    expect(ICONO_TAREA_SITIO[TAREA_DE_AREA.contenido]).toBe(ICONO_TAREA_SITIO[TAREA_DE_PASO.datos]);
    expect(ICONO_TAREA_SITIO[TAREA_DE_AREA.contenido]).toBe(iconoPasoAsistente('datos'));
    // El Globe es el icono del módulo, no un área más.
    expect(Object.values(TAREA_DE_AREA)).not.toContain('sitio');
  });

  test('las cuatro cifras tienen iconos distintos', () => {
    expect(new Set(Object.values(ICONO_KPI_SITIO)).size).toBe(4);
  });
});

describe('EncabezadoPaso', () => {
  test('pinta la caja de 40 px decorativa, el H2 y la descripción', () => {
    const { container, getByRole } = render(<EncabezadoPaso paso="dominio" titulo="¿Dónde vivirá tu sitio?" descripcion="Empieza gratis." />);
    expect(getByRole('heading', { level: 2, name: '¿Dónde vivirá tu sitio?' })).toBeTruthy();
    const caja = container.querySelector('[data-tamano="md"]');
    expect(caja?.getAttribute('aria-hidden')).toBe('true');
    expect(caja?.className).toContain('size-10');
  });
});

describe('ChecklistItem del Resumen con icono', () => {
  test('la lista de lanzamiento pinta el icono de 16 de cada tarea, sin caja (no corta el texto a 1024)', async () => {
    const { ListaLanzamiento } = await import('../ListaLanzamiento');
    const { container } = renderConIdioma(
      <ListaLanzamiento
        puedeEditar
        onPublicar={jest.fn()}
        pasos={[
          { id: 'plantilla', estado: 'listo', href: null, detalle: { clave: 'lanzamiento.detalle.plantilla', valores: {} } },
          { id: 'dominio', estado: 'actual', href: '/app/sitio-web/dominios', detalle: { clave: 'lanzamiento.detalle.dominio', valores: {} } },
        ] as never}
      />,
    );
    expect(container.querySelectorAll('[data-tamano="sm"]').length).toBe(0);
    const iconos = Array.from(container.querySelectorAll('li p svg'));
    expect(iconos.length).toBe(2);
    for (const svg of iconos) expect(svg.getAttribute('class')).toContain('size-4');
    expect(container.innerHTML).not.toContain('truncate');
  });
});

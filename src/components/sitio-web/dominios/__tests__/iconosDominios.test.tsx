/**
 * @jest-environment jsdom
 *
 * Iconos de Dominios: la misma acción lleva el mismo icono en todas las
 * pantallas, el icono de la página es el del menú y todos siguen la escala
 * del módulo (14 · 16 · 20, trazo 1,5, decorativos).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { ICONO_ACCION_SITIO, ICONO_ESTADO_DNS, ICONO_TAREA_SITIO } from '../../ui/iconosSitio';
import { RUTA_DOMINIOS_SITIO_WEB } from '../../rutasSitioWeb';
import {
  ICONO_ACCION_DOMINIO,
  ICONO_PAGINA_DOMINIOS,
  ICONO_RESULTADO_COMPRA,
  ICONO_RESULTADO_CONECTAR,
  ICONO_TARJETA_DOMINIO,
  ICONO_TIPO_DOMINIO,
  IconoBoton,
  IconoDominio,
} from '../iconosDominios';
import type { AccionContextual } from '../estadoDominio';
import type { TipoDominio } from '../tiposDominios';

describe('iconos de Dominios', () => {
  test('la caja del PageHeader lleva el globo del módulo, como en B/07-01 y 07-21', () => {
    const modulo = moduloPorCodigo('website');
    expect(modulo?.paginas.some((p) => p.href === RUTA_DOMINIOS_SITIO_WEB)).toBe(true);
    expect(ICONO_PAGINA_DOMINIOS).toBe(modulo!.icono);
    expect(ICONO_PAGINA_DOMINIOS).toBe(ICONO_TAREA_SITIO.sitio);
  });

  test('el eslabón solo dice «conectar» (y el tipo de dominio propio), nunca la página', () => {
    expect(ICONO_ACCION_DOMINIO.conectar).toBe(ICONO_TAREA_SITIO.dominio);
    expect(ICONO_ACCION_DOMINIO.conectar).not.toBe(ICONO_PAGINA_DOMINIOS);
    expect(ICONO_TARJETA_DOMINIO.conectarMio).toBe(ICONO_ACCION_DOMINIO.conectar);
    expect(ICONO_ACCION_DOMINIO.comprar).toBe(ICONO_TAREA_SITIO.ventas);
  });

  test('las acciones que abren el mismo paso del diálogo comparten icono', () => {
    // Botón «Revisar» de la fila y «Verificar ahora» del «⋯» y del detalle abren `modo: 'revisar'`.
    const mismoModo: Record<'revisar' | 'registros', (keyof typeof ICONO_ACCION_DOMINIO)[]> = {
      revisar: ['revisar', 'verificar'],
      registros: ['registros'],
    };
    for (const claves of Object.values(mismoModo)) expect(new Set(claves.map((c) => ICONO_ACCION_DOMINIO[c])).size).toBe(1);
    // Acciones que abren cosas distintas no se confunden.
    const contextuales: Exclude<AccionContextual, null>[] = ['renovar', 'registros', 'revisar'];
    for (const a of contextuales) expect(ICONO_ACCION_DOMINIO[a]).toBeTruthy();
    expect(new Set(contextuales.map((a) => ICONO_ACCION_DOMINIO[a])).size).toBe(contextuales.length);
  });

  test('copiar y su confirmación son los mismos en la fila DNS y en el «⋯»', () => {
    expect(ICONO_ACCION_DOMINIO.copiar).toBe(ICONO_ACCION_SITIO.copiar);
    expect(ICONO_ACCION_DOMINIO.copiado).toBe(ICONO_ACCION_SITIO.copiado);
    expect(ICONO_ESTADO_DNS.opcional).toBe(ICONO_ACCION_DOMINIO.info);
  });

  test('«Comprando» lleva el indicador de carga de B/07-16, no un carrito', () => {
    expect(ICONO_RESULTADO_COMPRA.comprando.icono).toBe(ICONO_ACCION_DOMINIO.enCurso);
  });

  test('ningún archivo del área elige su icono: solo iconosDominios importa de lucide-react', () => {
    const dir = join(__dirname, '..');
    const archivos = [
      ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== 'iconosDominios.tsx').map((f) => join(dir, f)),
      join(dir, '..', 'ui', 'DnsRecordRow.tsx'),
    ];
    // Se permite `import type { LucideIcon }`; no un valor.
    const importaValor = /import\s+(?!type\b)[^;]*from\s+['"]lucide-react['"]/;
    const infractores = archivos.filter((f) => importaValor.test(readFileSync(f, 'utf8')));
    expect(infractores).toEqual([]);
  });

  test('el subdominio gratis se distingue de los dominios propios', () => {
    const tipos: TipoDominio[] = ['comprado', 'propio', 'alias_www'];
    for (const t of tipos) expect(ICONO_TIPO_DOMINIO[t]).toBe(ICONO_TIPO_DOMINIO.comprado);
    expect(ICONO_TIPO_DOMINIO.subdominio).not.toBe(ICONO_TIPO_DOMINIO.comprado);
  });

  test('cada resultado de un flujo tiene icono y tono; ningún error usa el tono de éxito', () => {
    for (const r of Object.values(ICONO_RESULTADO_CONECTAR)) expect(r.icono).toBeTruthy();
    expect(ICONO_RESULTADO_CONECTAR.activo.tono).toBe('exito');
    expect(ICONO_RESULTADO_CONECTAR.mal_configurado.tono).toBe('peligro');
    expect(ICONO_RESULTADO_COMPRA.listo.tono).toBe('exito');
    expect(ICONO_RESULTADO_COMPRA.pagoRechazado.tono).toBe('peligro');
    expect(ICONO_RESULTADO_COMPRA.noDisponible.tono).toBe('peligro');
  });
});

describe('IconoDominio', () => {
  const clase = (el: Element | null) => el?.getAttribute('class') ?? '';

  test('escala del módulo y trazo 1,5, siempre decorativo', () => {
    const { container } = render(
      <>
        <IconoDominio icono={ICONO_ACCION_DOMINIO.conectar} tamano="meta" />
        <IconoDominio icono={ICONO_ACCION_DOMINIO.conectar} />
        <IconoDominio icono={ICONO_ACCION_DOMINIO.conectar} tamano="fila" />
      </>,
    );
    const [meta, base, fila] = Array.from(container.querySelectorAll('svg'));
    expect(clase(meta)).toContain('size-3.5');
    expect(clase(base)).toContain('size-4');
    expect(clase(fila)).toContain('size-5');
    for (const s of [meta, base, fila]) {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      expect(s.getAttribute('stroke-width')).toBe('1.5');
    }
  });

  test('el icono de un botón ocupado gira y se detiene con movimiento reducido', () => {
    const { container, rerender } = render(<IconoBoton icono={ICONO_ACCION_DOMINIO.buscar} ocupado />);
    expect(clase(container.querySelector('svg'))).toContain('animate-spin');
    expect(clase(container.querySelector('svg'))).toContain('motion-reduce:animate-none');
    rerender(<IconoBoton icono={ICONO_ACCION_DOMINIO.buscar} />);
    expect(clase(container.querySelector('svg'))).not.toContain('animate-spin');
  });
});

import {
  buscadorCelular,
  buscadorComputador,
  buscadorEnConjunto,
  cambioBuscadorCelular,
  cambioBuscadorComputador,
  cambioBuscadorEnConjunto,
  formaBuscadorCelular,
} from '../inspector/buscadorCelularLogica';
import { BUSCADORES } from '../inspector/encabezadoCapacidades';
import { cambioBuscador } from '../inspector/anterioresLogica';
import { muestraBuscadorPantallaCompleta } from '../inspector/celularLogica';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEXTOS_EDITOR } from '../textos';

const K = 'mobile_search_same_as_desktop';
const FORMA = { icon: 'icon', bar: 'bar', mini: 'bar', icon_overlay: 'icon', mega: 'bar', pill_floating: 'bar', hidden: 'hidden' } as const;

/** Lo que pinta la tienda (goadmin-websites lib/website/opcionUnica.ts → buscadorMovilEfectivo). */
function formaTienda(a: Record<string, unknown>): 'icon' | 'bar' | 'hidden' {
  const valido = (v: unknown) => ((BUSCADORES as readonly unknown[]).includes(v) ? (v as keyof typeof FORMA) : null);
  const elegido = a[K] === true
    ? valido(a.search_style) ?? 'icon'
    : valido(a.mobile_search_style) ?? (a.mobile_search_style === null ? valido(a.search_style) ?? 'icon' : 'icon');
  return FORMA[elegido];
}

describe('buscador del celular: en conjunto o por separado', () => {
  it('las 7 opciones y su forma en el celular', () => {
    expect(BUSCADORES).toHaveLength(7);
    for (const v of BUSCADORES) expect(formaBuscadorCelular(v)).toBe(FORMA[v]);
  });

  it('el interruptor solo se enciende con true (ausente = por separado, como hoy)', () => {
    expect(buscadorEnConjunto({})).toBe(false);
    expect(buscadorEnConjunto({ [K]: 'true' })).toBe(false);
    expect(buscadorEnConjunto({ [K]: true })).toBe(true);
  });

  it('en conjunto el celular muestra la opción de computador, guarde lo que guarde', () => {
    for (const pc of BUSCADORES) {
      for (const cel of [undefined, null, ...BUSCADORES]) {
        expect(buscadorCelular({ [K]: true, search_style: pc, mobile_search_style: cel })).toBe(pc);
      }
    }
  });

  it('por separado el celular acepta las 7 opciones, sin importar computador', () => {
    for (const cel of BUSCADORES) {
      for (const pc of BUSCADORES) expect(buscadorCelular({ search_style: pc, mobile_search_style: cel })).toBe(cel);
    }
  });

  it('por separado y en null sigue a computador; ausente es ícono', () => {
    for (const pc of BUSCADORES) expect(buscadorCelular({ search_style: pc, mobile_search_style: null })).toBe(pc);
    expect(buscadorCelular({ search_style: 'mega' })).toBe('icon');
    expect(buscadorComputador({})).toBe('icon');
  });

  it('el selector muestra lo mismo que pinta la tienda (vista previa = publicado)', () => {
    for (const igual of [undefined, false, true]) {
      for (const pc of [undefined, ...BUSCADORES]) {
        for (const cel of [undefined, null, ...BUSCADORES]) {
          const a = { [K]: igual, search_style: pc, mobile_search_style: cel };
          expect(formaBuscadorCelular(buscadorCelular(a))).toBe(formaTienda(a));
        }
      }
    }
  });

  it('el buscador del encabezado configurable (mobile_header.search) decide la forma', () => {
    expect(buscadorCelular({ mobile_header: { search: 'bar' }, mobile_search_style: 'icon' })).toBe('bar');
    expect(buscadorCelular({ mobile_header: { search: 'bar' }, mobile_search_style: 'mega' })).toBe('mega');
    expect(buscadorCelular({ mobile_header: { search: 'fullscreen' }, mobile_search_style: 'mega' })).toBe('icon');
    expect(buscadorCelular({ mobile_header: { search: 'icon' }, mobile_search_style: 'icon_overlay' })).toBe('icon_overlay');
    expect(buscadorCelular({ [K]: true, mobile_header: { search: 'bar' }, search_style: 'icon' })).toBe('icon');
  });

  it('compatibilidad: icon, bar y hidden guardados en celular se ven igual', () => {
    for (const cel of ['icon', 'bar', 'hidden'] as const) {
      for (const pc of BUSCADORES) expect(formaBuscadorCelular(buscadorCelular({ search_style: pc, mobile_search_style: cel }))).toBe(cel);
    }
  });
});

describe('cambios del panel', () => {
  it('en conjunto, «Buscador» es el cambio de siempre (cambioBuscador)', () => {
    const a = { [K]: true, search_style: 'icon', mobile_search_style: 'bar' };
    expect(cambioBuscadorComputador(a, 'mega')).toEqual(cambioBuscador(a, 'mega'));
  });

  it('por separado, «Computador» no cambia lo que se ve en el celular', () => {
    expect(cambioBuscadorComputador({ search_style: 'icon', mobile_search_style: 'bar' }, 'mega')).toEqual({ search_style: 'mega' });
    expect(cambioBuscadorComputador({ search_style: 'pill_floating', mobile_search_style: null }, 'icon')).toEqual({ search_style: 'icon', mobile_search_style: 'pill_floating' });
    expect(cambioBuscadorComputador({ search_style: 'bar' }, 'hidden')).toEqual({ search_style: 'hidden' });
    for (const pc of BUSCADORES) {
      for (const cel of [undefined, null, ...BUSCADORES]) {
        const a: Record<string, unknown> = { search_style: pc, mobile_search_style: cel };
        const antes = buscadorCelular(a);
        for (const nuevo of BUSCADORES) expect(buscadorCelular({ ...a, ...cambioBuscadorComputador(a, nuevo) })).toBe(antes);
      }
    }
  });

  it('por separado, «Celular» guarda cualquiera de las 7 y no toca computador', () => {
    for (const v of BUSCADORES) {
      const a = { search_style: 'icon', mobile_search_style: 'icon' };
      const c = cambioBuscadorCelular(a, v);
      expect(c).toEqual({ mobile_search_style: v });
      expect(buscadorCelular({ ...a, ...c })).toBe(v);
      expect(buscadorComputador({ ...a, ...c })).toBe('icon');
    }
    // Ejemplo del pedido: lupa en computador y buscador grande bajo el logo en celular.
    const ej = { search_style: 'icon', ...cambioBuscadorCelular({ search_style: 'icon' }, 'mega') };
    expect(formaTienda(ej)).toBe('bar');
  });

  it('«Celular» quita el buscador viejo del encabezado configurable', () => {
    expect(cambioBuscadorCelular({ mobile_header: { search: 'bar', panel: { width: 80 } } }, 'mega')).toEqual({ mobile_search_style: 'mega', mobile_header: { panel: { width: 80 } } });
    // Solo con el buscador viejo el celular dejaría su encabezado: se le pone la forma de la opción.
    expect(cambioBuscadorCelular({ mobile_header: { search: 'icon' } }, 'pill_floating')).toEqual({ mobile_search_style: 'pill_floating', mobile_header: { search: 'bar' } });
    expect(cambioBuscadorCelular({ mobile_header: { search: 'bar' } }, 'hidden')).toEqual({ mobile_search_style: 'hidden', mobile_header: null });
    // «Pantalla completa» se conserva mientras el celular siga con ícono.
    expect(cambioBuscadorCelular({ mobile_header: { search: 'fullscreen' } }, 'icon_overlay')).toEqual({ mobile_search_style: 'icon_overlay' });
    for (const v of BUSCADORES) {
      const a: Record<string, unknown> = { mobile_header: { search: 'bar', icons: { style: 'circle' } } };
      expect(buscadorCelular({ ...a, ...cambioBuscadorCelular(a, v) })).toBe(v);
    }
  });

  it('encender el interruptor solo enciende; apagarlo deja el celular igual al computador', () => {
    expect(cambioBuscadorEnConjunto({ search_style: 'mega', mobile_search_style: 'icon' }, true)).toEqual({ [K]: true });
    const a = { [K]: true, search_style: 'mega', mobile_search_style: 'icon' };
    const c = cambioBuscadorEnConjunto(a, false);
    expect(c).toEqual({ [K]: false, mobile_search_style: null });
    expect(buscadorCelular({ ...a, ...c })).toBe('mega');
    const conViejo = { [K]: true, search_style: 'mini', mobile_header: { search: 'icon', layout: { sticky: true } } };
    const c2 = cambioBuscadorEnConjunto(conViejo, false);
    expect(c2.mobile_header).toEqual({ layout: { sticky: true } });
    expect(buscadorCelular({ ...conViejo, ...c2 })).toBe('mini');
  });

  it('«Pantalla completa» del celular se ofrece solo con ícono, en conjunto o por separado', () => {
    expect(muestraBuscadorPantallaCompleta({ search_style: 'icon', mobile_search_style: 'mega' })).toBe(false);
    expect(muestraBuscadorPantallaCompleta({ search_style: 'mega', mobile_search_style: 'icon_overlay' })).toBe(true);
    expect(muestraBuscadorPantallaCompleta({ [K]: true, search_style: 'pill_floating', mobile_search_style: 'icon' })).toBe(false);
    expect(muestraBuscadorPantallaCompleta({ [K]: true, search_style: 'icon_overlay' })).toBe(true);
  });

  it('mobile_search_style ya no es un ajuste anterior: es el selector «Celular»', () => {
    // Leído del fuente: importar el inspector arrastra el cliente de Supabase.
    const src = readFileSync(join(__dirname, '../inspector/InspectorEncabezado.tsx'), 'utf8');
    const lista = src.slice(src.indexOf('export const CLAVES_ANTERIORES_ENCABEZADO'), src.indexOf('];', src.indexOf('export const CLAVES_ANTERIORES_ENCABEZADO')));
    expect(lista).toContain("'mobile_show_topbar'");
    expect(lista).not.toContain("  'mobile_search_style',");
  });

  it('textos del panel', () => {
    const d = TEXTOS_EDITOR.zonaGlobal.diseno;
    expect(d.categoriasBuscadorCelularAyuda).toBe('Enciéndelo para usar el mismo buscador en computador y celular, o apágalo para elegir uno distinto en cada uno.');
    expect(d.buscadorEnComputador).toBe('Computador');
    expect(d.buscadorEnCelular).toBe('Celular');
  });
});

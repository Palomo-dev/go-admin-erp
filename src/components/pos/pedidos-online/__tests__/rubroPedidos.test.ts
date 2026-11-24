/**
 * Pedidos online habla el idioma de cada negocio (2026-11-24): el gorro de
 * chef y la «preparación» son de restaurante; una tienda (y cualquier otro
 * tipo de organización) alista el empaque. Solo presentación.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ChefHat, PackageOpen } from 'lucide-react';
import { rubroDeTipoOrg } from '@/lib/pos/pedidosWeb/avisosCliente';
import { claveEstadoPedido, claveRubro, rubroDeTipoOrgId } from '@/lib/pos/pedidosWeb/rubroPedidos';
import { ICONO_PREPARAR } from '../rubroPedidosUi';
import { pasoSiguiente } from '../listado/TablaPedidosOnline';
import type { WebOrder } from '@/lib/services/webOrdersService';

// La tabla arrastra el kit (y este, el cliente de Supabase): sin red ni variables de entorno en jest.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: null }) }));

const RAIZ = process.cwd();
const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
const mensajes = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(readFileSync(join(RAIZ, 'messages', `${l}.json`), 'utf-8')) as Record<string, unknown>]),
) as Record<(typeof IDIOMAS)[number], Record<string, unknown>>;

const valor = (obj: unknown, ruta: string): unknown =>
  ruta.split('.').reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined), obj);

const pedido = (status: WebOrder['status']) => ({ status, delivery_type: 'delivery_own' }) as WebOrder;

describe('de dónde sale el rubro', () => {
  // organization_types verificado en la base el 2026-11-24.
  const TIPOS: Array<[number, string]> = [
    [1, 'restaurant'],
    [2, 'hotel'],
    [3, 'retail'],
    [4, 'services'],
    [5, 'gym'],
    [6, 'transport'],
    [7, 'parking'],
  ];

  test.each(TIPOS)('type_id %i (%s): misma regla que los avisos al cliente', (id, nombre) => {
    expect(rubroDeTipoOrgId(id)).toBe(rubroDeTipoOrg(nombre));
  });

  test('solo restaurante prepara; sin dato, tienda (el default de Pedidos online)', () => {
    expect(rubroDeTipoOrgId(1)).toBe('restaurante');
    expect(rubroDeTipoOrgId(3)).toBe('tienda');
    expect(rubroDeTipoOrgId(null)).toBe('tienda');
    expect(rubroDeTipoOrgId(undefined)).toBe('tienda');
  });
});

describe('el gorro de chef solo en restaurante', () => {
  test('acción rápida de un pedido «Confirmado»', () => {
    expect(pasoSiguiente(pedido('confirmed'), 'restaurante')?.icono).toBe(ChefHat);
    expect(pasoSiguiente(pedido('confirmed'), 'tienda')?.icono).toBe(PackageOpen);
    expect(pasoSiguiente(pedido('confirmed'))?.icono).not.toBe(ChefHat);
  });

  test('el resto de pasos no depende del rubro', () => {
    for (const s of ['pending', 'preparing', 'ready', 'in_delivery'] as const) {
      expect(pasoSiguiente(pedido(s), 'tienda')).toEqual(pasoSiguiente(pedido(s), 'restaurante'));
    }
  });

  test('ningún archivo de Pedidos online usa ChefHat fuera del mapa por rubro', () => {
    const carpetas = ['src/components/pos/pedidos-online', 'src/app/app/pos/pedidos-online'];
    const archivos = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p);
        return /\.tsx?$/.test(n) ? [p] : [];
      });
    const ofensores = carpetas
      .flatMap((c) => archivos(join(RAIZ, c)))
      .filter((f) => /\bChefHat\b/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(RAIZ, f).replace(/\\/g, '/'));
    expect(ofensores).toEqual(['src/components/pos/pedidos-online/rubroPedidosUi.tsx']);
    expect(ICONO_PREPARAR).toEqual({ restaurante: ChefHat, tienda: PackageOpen });
  });
});

describe('textos por rubro', () => {
  test('el restaurante conserva sus claves; la tienda lee la hermana «…Tienda»', () => {
    expect(claveRubro('filaAcciones.preparar', 'restaurante')).toBe('filaAcciones.preparar');
    expect(claveRubro('filaAcciones.preparar', 'tienda')).toBe('filaAcciones.prepararTienda');
    expect(claveEstadoPedido('preparing', 'tienda')).toBe('preparingTienda');
    expect(claveEstadoPedido('preparing', 'restaurante')).toBe('preparing');
    expect(claveEstadoPedido('ready', 'tienda')).toBe('ready');
  });

  test('en español la tienda dice «Alistando» y «Empezar a alistar», como la tienda web', () => {
    expect(valor(mensajes.es, 'pedidosOnlineListado.estados.preparingTienda')).toBe('Alistando');
    expect(valor(mensajes.es, 'pedidosOnlineListado.filaAcciones.prepararTienda')).toBe('Empezar a alistar');
    expect(valor(mensajes.es, 'pedidoWeb.orderTimeline.pasos.preparingTienda')).toBe('Alistando');
    expect(valor(mensajes.es, 'pedidoWeb.confirmacion.comandaEnviadaTienda')).toBe('Orden de alistamiento enviada');
    // El restaurante no cambia.
    expect(valor(mensajes.es, 'pedidosOnlineListado.estados.preparing')).toBe('Preparando');
    expect(valor(mensajes.es, 'pedidoWeb.confirmacion.comandaEnviada')).toBe('Comanda enviada a cocina');
  });

  /** Claves `…Tienda` de los namespaces de Pedidos online, por idioma. */
  const clavesTienda = (raiz: unknown, prefijo = ''): string[] =>
    raiz && typeof raiz === 'object'
      ? Object.entries(raiz as Record<string, unknown>).flatMap(([k, v]) =>
          typeof v === 'string' ? (k.endsWith('Tienda') ? [prefijo + k] : []) : clavesTienda(v, `${prefijo}${k}.`),
        )
      : [];

  test.each(['pedidoWeb', 'pedidosOnlineListado'])('%s: las mismas claves de tienda en los 4 idiomas, cada una con su clave de restaurante', (ns) => {
    const es = clavesTienda(mensajes.es[ns]).sort();
    expect(es.length).toBeGreaterThan(5);
    for (const l of IDIOMAS) {
      expect(clavesTienda(mensajes[l][ns]).sort()).toEqual(es);
      for (const k of es) {
        const tienda = valor(mensajes[l][ns], k);
        const restaurante = valor(mensajes[l][ns], k.replace(/Tienda$/, ''));
        expect(typeof tienda === 'string' && tienda.trim().length > 0).toBe(true);
        expect(typeof restaurante).toBe('string');
        // Mismas variables ICU que la clave de restaurante.
        const vars = (s: string) => (s.match(/\{(\w+)[,}]/g) ?? []).sort();
        expect(vars(tienda as string)).toEqual(vars(restaurante as string));
      }
    }
  });

  test('ningún texto de tienda habla de cocina ni de comanda', () => {
    for (const l of IDIOMAS) {
      for (const ns of ['pedidoWeb', 'pedidosOnlineListado']) {
        for (const k of clavesTienda(mensajes[l][ns])) {
          // Sin las variables ICU: `{comanda}` es el nombre del parámetro, no texto visible.
          const texto = String(valor(mensajes[l][ns], k)).replace(/\{\w+\}/g, '');
          expect({ clave: `${l}:${ns}.${k}`, cocina: /cocina|comanda|kitchen|cuisine|cozinha|receta|recipe|recette|receita/i.test(texto) }).toEqual({ clave: `${l}:${ns}.${k}`, cocina: false });
        }
      }
    }
  });

  test('cada claveRubro(…) literal del código tiene su hermana «…Tienda»', () => {
    const archivos = [
      'src/app/app/pos/pedidos-online/page.tsx',
      'src/app/app/pos/pedidos-online/[id]/page.tsx',
      'src/app/app/pos/pedidos-online/[id]/hooks/useWebOrderDetail.ts',
      'src/app/app/pos/pedidos-online/[id]/components/OrderHeader.tsx',
      'src/app/app/pos/pedidos-online/[id]/components/OrderDocumentsCard.tsx',
      'src/app/app/pos/pedidos-online/[id]/components/OrderNotesCard.tsx',
      'src/app/app/pos/pedidos-online/[id]/components/ConfirmOrderDialog.tsx',
      'src/components/pos/pedidos-online/OrderActions.tsx',
      'src/components/pos/pedidos-online/OrderItemsList.tsx',
      'src/components/pos/pedidos-online/WebOrderCard.tsx',
    ];
    const literales = archivos.flatMap((f) => [...readFileSync(join(RAIZ, f), 'utf-8').matchAll(/claveRubro\('([^']+)'/g)].map((m) => m[1]));
    expect(literales.length).toBeGreaterThan(15);
    for (const l of IDIOMAS) {
      for (const clave of literales) {
        const enAlguno = ['pedidoWeb', 'pedidosOnlineListado'].some((ns) => typeof valor(mensajes[l][ns], `${clave}Tienda`) === 'string');
        expect(`${l}:${clave}Tienda ${enAlguno ? 'existe' : 'falta'}`).toBe(`${l}:${clave}Tienda existe`);
      }
    }
  });
});

/**
 * Iconos del área «ventas»: cada tema, estado y marca tiene el suyo; los
 * estados no se confunden entre sí; y los «Ir a …» usan el icono de la página
 * destino tal como sale en el menú (catálogo de navegación).
 */
import { CreditCard, DollarSign, Link2, ShoppingBag, ShoppingCart, Ticket, CalendarClock, ArrowRight } from 'lucide-react';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { ICONO_TAREA_SITIO } from '../../ui/iconosSitio';
import { TEMAS_VENTA, TIPOS_ENTREGA } from '../estadoVentas';
import { MODOS_SEDES } from '../sedesWeb';
import {
  ICONO_ENTREGA,
  ICONO_ESTADO_VENTA,
  ICONO_MARCA_FILA,
  ICONO_MODO_SEDES,
  ICONO_PESTANA_TIENDA,
  ICONO_TEMA_VENTA,
  iconoDestino,
} from '../iconosVentas';

describe('iconos del tablero de Ventas en línea', () => {
  test('cada tema tiene un icono y no se repiten', () => {
    const iconos = TEMAS_VENTA.map((t) => ICONO_TEMA_VENTA[t]);
    expect(iconos.every(Boolean)).toBe(true);
    expect(new Set(iconos).size).toBe(TEMAS_VENTA.length);
  });

  test('checkout y pagos reutilizan los iconos de tarea del módulo', () => {
    expect(ICONO_TEMA_VENTA.checkout).toBe(ICONO_TAREA_SITIO.ventas);
    expect(ICONO_TEMA_VENTA.pagos).toBe(ICONO_TAREA_SITIO.pagos);
  });

  test('«Ventas en línea» del menú usa el mismo icono que la tarea', () => {
    const sitio = CATALOGO_NAV.find((m) => m.codigo === 'website');
    const ventas = sitio?.paginas.find((p) => p.href === '/app/sitio-web/ventas');
    expect(ventas?.icono).toBe(ICONO_TAREA_SITIO.ventas);
  });

  test('los cuatro estados y las tres marcas tienen iconos distintos', () => {
    const estados = Object.values(ICONO_ESTADO_VENTA);
    expect(estados).toHaveLength(4);
    expect(new Set(estados).size).toBe(4);
    const marcas = Object.values(ICONO_MARCA_FILA).map((m) => m.icono);
    expect(new Set(marcas).size).toBe(3);
    // El color de la marca es texto profundo (pasa AA), nunca el tono de relleno.
    expect(ICONO_MARCA_FILA.ok.clase).toBe('text-success-text');
    expect(ICONO_MARCA_FILA.alerta.clase).toBe('text-warning-text');
  });

  test('tipos de entrega, modos de sedes y pestañas de Tienda tienen icono', () => {
    expect(TIPOS_ENTREGA.every((t) => ICONO_ENTREGA[t])).toBe(true);
    expect(new Set(TIPOS_ENTREGA.map((t) => ICONO_ENTREGA[t])).size).toBe(TIPOS_ENTREGA.length);
    expect(MODOS_SEDES.every((m) => ICONO_MODO_SEDES[m])).toBe(true);
    expect(ICONO_MODO_SEDES.selector).toBe(ICONO_TAREA_SITIO.sedes);
    expect(ICONO_PESTANA_TIENDA.catalogo).toBe(ICONO_TAREA_SITIO.catalogo);
  });
});

describe('iconoDestino: el icono del menú de la página destino', () => {
  test('páginas del menú', () => {
    expect(iconoDestino('/app/finanzas/metodos-pago')).toBe(CreditCard);
    expect(iconoDestino('/app/transporte/tarifas-envio')).toBe(DollarSign);
    expect(iconoDestino('/app/pos/cupones')).toBe(Ticket);
    expect(iconoDestino('/app/pos/pedidos-online')).toBe(ShoppingBag);
    expect(iconoDestino('/app/integraciones/conexiones')).toBe(Link2);
  });

  test('ignora la consulta: reservas con ?tab=configuracion', () => {
    expect(iconoDestino('/app/pos/reservas-mesas?tab=configuracion')).toBe(CalendarClock);
  });

  test('ruta fuera del menú: el icono de su módulo; desconocida: flecha', () => {
    expect(iconoDestino('/app/pos/una-ruta-sin-menu')).toBe(ShoppingCart);
    expect(iconoDestino('/otra/cosa')).toBe(ArrowRight);
  });
});

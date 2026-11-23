/**
 * Muestras de la vista previa de «Estilo de los íconos» con los íconos REALES del sitio: los de la
 * cabecera (cuenta y carrito, con su dibujo de siempre o del catálogo nuevo) y los botones del
 * menú inferior.
 */
import { ShoppingCart, User, type LucideIcon } from 'lucide-react';
import { glifosCabecera, leerEstiloGlifos, type EstiloGlifos } from '@/lib/website/v2/glifosTienda';
import { leerMenuInferior, type MenuInferior } from '@/lib/website/menuInferior';
import { ICONOS_LUCIDE_ENCABEZADO, iconoAccionEncabezado } from '../iconosAccionesLogica';
import type { MuestraGlifo } from './EstiloIconosSeccion';

type Ajustes = Record<string, unknown>;

function lucideDe(nombre: string, respaldo: LucideIcon): LucideIcon {
  return Object.prototype.hasOwnProperty.call(ICONOS_LUCIDE_ENCABEZADO, nombre) ? ICONOS_LUCIDE_ENCABEZADO[nombre] : respaldo;
}

/** Cuenta y carrito de la cabecera, como los pinta la tienda. */
export function muestrasCabecera(a: Ajustes): MuestraGlifo[] {
  const glifos = glifosCabecera(a);
  const cuenta = iconoAccionEncabezado(a, 'account');
  const carrito = iconoAccionEncabezado(a, 'cart');
  return [
    { clave: 'cuenta', etiqueta: 'cuenta', Lucide: lucideDe(cuenta, User), nombre: cuenta, glifo: glifos.cuenta ?? null },
    { clave: 'carrito', etiqueta: 'carrito', Lucide: lucideDe(carrito, ShoppingCart), nombre: carrito, glifo: glifos.carrito ?? null },
  ];
}

/** Los botones visibles del menú (hasta 5), con su dibujo. */
export function muestrasMenu(m: MenuInferior, iconoMenu: Readonly<Record<string, LucideIcon>>): MuestraGlifo[] {
  return m.items
    .filter((b) => b.visible)
    .slice(0, 5)
    .map((b) => ({ clave: b.id, etiqueta: b.label, Lucide: iconoMenu[b.icon] ?? User, nombre: b.icon, glifo: b.glyph ?? null }));
}

/** «Estilo de los íconos» del menú inferior guardado (para «Igual que el menú inferior»). */
export function estiloGlifosMenu(a: Ajustes): EstiloGlifos | null {
  return leerEstiloGlifos(leerMenuInferior(a)?.style.iconStyle ?? null);
}

'use client';

/**
 * /app/sitio-web/sedes — «Sedes en la web» (Figma B/11-01…11-05). La entrada
 * del menú ya existía en el catálogo (requiere `variasSedes`); faltaba la
 * página. Con una sola sucursal (entrada directa por URL) muestra el vacío
 * «Tienes una sola sucursal».
 */
import { PantallaSedesWeb } from '@/components/sitio-web/ventas/PantallaSedesWeb';

export default function SedesSitioWebPage() {
  return <PantallaSedesWeb />;
}

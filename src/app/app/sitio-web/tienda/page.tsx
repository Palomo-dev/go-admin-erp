'use client';

/**
 * /app/sitio-web/tienda — «Tienda» (Figma A/01b y A/04i): catálogo web por
 * sede, plantillas de producto y categoría, y reseñas como una pestaña (el
 * panel de moderación existente). `?tab=resenas` llega desde la redirección
 * de Branding › Reseñas.
 */
import { PantallaTienda } from '@/components/sitio-web/ventas/PantallaTienda';

export default function TiendaSitioWebPage() {
  return <PantallaTienda />;
}

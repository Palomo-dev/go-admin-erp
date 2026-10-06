'use client';

/**
 * /app/sitio-web/configuracion — «Configuración del sitio» (Figma B/12-01…12-06):
 * un solo formulario con índice lateral y una sola barra de guardado. Las
 * pestañas viejas de Branding (Contenido y Avanzado) dejan de usarse aquí: redes
 * van a SEO y redes, píxeles a Analítica y horario a la sucursal.
 */
import { ConfiguracionSitio } from '@/components/sitio-web/configuracion/ConfiguracionSitio';

export default function ConfiguracionSitioWebPage() {
  return <ConfiguracionSitio />;
}

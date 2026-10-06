'use client';

/**
 * /app/sitio-web — «Resumen» del módulo Sitio web (Figma A/02a-02i): estado de
 * publicación, dirección real, lista de lanzamiento, KPIs, alertas y cambios
 * recientes; en «primera vez», el héroe que lleva al asistente. Todo en
 * `ResumenSitio` sobre `GET /api/sitio-web/resumen`.
 */
import { ResumenSitio } from '@/components/sitio-web/resumen/ResumenSitio';

export default function ResumenSitioWebPage() {
  return <ResumenSitio />;
}

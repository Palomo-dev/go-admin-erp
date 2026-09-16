'use client';

/**
 * /app/crm/pronostico — desde F14 es el panel Revenue OS (resumen, embudo,
 * forecast, cohortes y matemática comercial). Misma ruta y misma entrada de
 * navegación: el pronóstico anterior vive en la pestaña «Forecast».
 */

import { RevenueOsPage } from '@/components/crm/revenueos/RevenueOsPage';

export default function PronosticoPage() {
  return <RevenueOsPage />;
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CotizacionesService, type Quotation } from '@/lib/services/cotizacionesService';
import { DetalleCotizacion } from '@/components/finanzas/cotizaciones/id/DetalleCotizacion';
import { Loader2, FileQuestion, ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/kit';

const RUTA_LISTADO = '/app/finanzas/cotizaciones';

export default function CotizacionDetallePage() {
  const params = useParams();
  const [cotizacion, setCotizacion] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadCotizacion = async () => {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const id = params?.id as string;
        const data = await CotizacionesService.getQuotationById(id);
        if (!data) {
          setNotFound(true);
          return;
        }
        setCotizacion(data);
      } catch (err) {
        console.error('Error loading quotation:', err);
        setError('Error al cargar la cotización. Verifica tu conexión e inténtalo de nuevo.');
      } finally {
        setLoading(false);
      }
    };

    if (params?.id) loadCotizacion();
  }, [params?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="empty"
          icono={FileQuestion}
          titulo="Cotización no encontrada"
          descripcion="La cotización que buscas no existe o ha sido eliminada."
          accion={{ etiqueta: 'Volver a cotizaciones', href: RUTA_LISTADO, icono: ArrowLeft }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="error"
          titulo="Error al cargar"
          descripcion={error}
          accion={{ etiqueta: 'Volver a cotizaciones', href: RUTA_LISTADO, icono: ArrowLeft }}
        />
      </div>
    );
  }

  if (!cotizacion) return null;

  return <DetalleCotizacion cotizacion={cotizacion} />;
}

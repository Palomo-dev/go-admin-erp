'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CotizacionesService, type Quotation } from '@/lib/services/cotizacionesService';
import { DetalleCotizacion } from '@/components/finanzas/cotizaciones/id/DetalleCotizacion';
import { Loader2, FileQuestion, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CotizacionDetallePage() {
  const params = useParams();
  const router = useRouter();
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
        const id = params.id as string;
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

    if (params.id) loadCotizacion();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 gap-4">
        <FileQuestion className="h-16 w-16 text-gray-400 dark:text-gray-600" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Cotización no encontrada</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            La cotización que buscas no existe o ha sido eliminada.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/app/finanzas/cotizaciones')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a cotizaciones
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 gap-4">
        <AlertTriangle className="h-16 w-16 text-amber-500" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Error al cargar</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/app/finanzas/cotizaciones')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a cotizaciones
        </Button>
      </div>
    );
  }

  if (!cotizacion) return null;

  return <DetalleCotizacion cotizacion={cotizacion} />;
}

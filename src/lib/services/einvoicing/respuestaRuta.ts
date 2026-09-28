/**
 * Respuesta HTTP común de las rutas que envían un documento electrónico
 * (factura, nota crédito, documento soporte) tras encolarlo.
 */

import { NextResponse } from 'next/server';
import type { JobCola, ResultadoJob } from './colaFacturacion.server';

export function respuestaDeEnvio(job: JobCola, resultado: ResultadoJob | null, servicioActivo: boolean): NextResponse {
  if (!servicioActivo) {
    return NextResponse.json(
      {
        success: true,
        queued: true,
        jobId: job.id,
        status: 'pending_activation',
        message:
          'El servicio de facturación electrónica de GO Admin aún no está activo para esta organización. El documento quedó en cola, retenido.',
      },
      { status: 202 },
    );
  }

  if (!resultado) {
    // Ya en vuelo, esperando su turno de reintento o retenido: sigue en la cola.
    return NextResponse.json(
      { success: true, queued: true, jobId: job.id, status: job.status, message: 'El documento está en la cola de envío a la DIAN.' },
      { status: 202 },
    );
  }

  if (resultado.estado === 'accepted' || resultado.estado === 'sent') {
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: resultado.estado,
      data: { number: resultado.numero ?? null, cufe: resultado.cufe ?? null },
    });
  }

  if (resultado.estado === 'pending') {
    return NextResponse.json(
      { success: true, queued: true, jobId: job.id, status: 'pending', message: 'No se pudo enviar ahora; se reintentará automáticamente.' },
      { status: 202 },
    );
  }

  return NextResponse.json(
    { success: false, jobId: job.id, status: resultado.estado, error: resultado.mensaje || 'La DIAN o Factus rechazaron el documento' },
    { status: 422 },
  );
}

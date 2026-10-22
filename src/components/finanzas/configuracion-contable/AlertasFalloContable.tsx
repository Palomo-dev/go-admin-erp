'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { etiquetaMotivoFallo, etiquetaOrigen } from '@/lib/finanzas/configuracionContable';
import { ConfiguracionContableService, type FalloContable } from './ConfiguracionContableService';

export function AlertasFalloContable({ compacto = false }: { compacto?: boolean }) {
  const { formatDateTime } = useFormatDate();
  const [total, setTotal] = useState(0);
  const [filas, setFilas] = useState<FalloContable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    ConfiguracionContableService.fallosPendientes(compacto ? 3 : 30)
      .then((resultado) => {
        if (!vivo) return;
        setTotal(resultado.total);
        setFilas(resultado.filas);
      })
      .catch(() => {
        if (vivo) setError('No se pudieron cargar los documentos con fallo contable.');
      });
    return () => {
      vivo = false;
    };
  }, [compacto]);

  if (error) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fallo contable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (total === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {total === 1 ? 'Hay 1 documento con fallo contable' : `Hay ${total} documentos con fallo contable`}
      </AlertTitle>
      <AlertDescription>
        <p>
          No se publicó el asiento. Revisa la cuenta en Configuración contable o en la regla, y vuelve a registrar el documento.
        </p>
        <ul className="mt-3 space-y-2">
          {filas.map((fila) => (
            <li key={fila.id} className="text-sm">
              <span className="font-medium">{etiquetaOrigen(fila.source)}</span>
              {fila.source_id ? ` ${fila.source_id}` : ''}
              {' · '}
              {etiquetaMotivoFallo(fila.reason)}
              {fila.detail ? ` — ${fila.detail}` : ''}
              {' · '}
              {formatDateTime(fila.created_at)}
            </li>
          ))}
        </ul>
        {compacto && (
          <Link href="/app/finanzas/configuracion-contable" className="mt-3 inline-block font-medium underline">
            Ver la configuración y el resto de fallos
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

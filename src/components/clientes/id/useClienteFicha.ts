'use client';

import { useEffect, useState } from 'react';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { claveError, pedirCrm, type ClaveErrorCrm } from '@/components/crm/acciones/apiCrm';
import type { ClienteFicha } from '@/lib/services/crm/fichaClienteService';

interface EstadoFicha {
  clave: string;
  cliente: ClienteFicha | null;
  loading: boolean;
  error: ClaveErrorCrm | null;
}

/** Descarta respuestas viejas y limpia la ficha al cambiar cliente u organización. */
export function useClienteFicha(id: string, recarga: number) {
  const [organizacionRevision, setOrganizacionRevision] = useState(0);
  const clave = `${id}:${recarga}:${organizacionRevision}`;
  const [estado, setEstado] = useState<EstadoFicha>({ clave: '', cliente: null, loading: true, error: null });
  useEffect(() => {
    const alCambiar = () => setOrganizacionRevision(n => n + 1);
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, alCambiar);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, alCambiar);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let vivo = true;
    setEstado({ clave, cliente: null, loading: true, error: null });
    if (!id) {
      setEstado({ clave, cliente: null, loading: false, error: 'noEncontrado' });
      return () => controller.abort();
    }
    pedirCrm<ClienteFicha>(`/api/clientes/${encodeURIComponent(id)}`, { signal: controller.signal }).then(
      ({ data }) => { if (vivo) setEstado({ clave, cliente: data, loading: false, error: null }); },
      error => { if (vivo) setEstado({ clave, cliente: null, loading: false, error: claveError(error) }); },
    );
    return () => { vivo = false; controller.abort(); };
  }, [id, clave]);
  return estado.clave === clave ? estado : { clave, cliente: null, loading: true, error: null };
}

'use client';

/**
 * Foto de evidencia de una marca del kiosco (plan de Marcación §5.2). La pide a
 * `GET /api/hrm/marcacion/fotos/[id]`: la base comprueba el permiso y registra la
 * vista en hr_access_log; el enlace firmado dura 60 s y no se guarda.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { AvisoTonal, Dialogo, Skeleton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPersonas, pedir } from '../personas/apiPersonas';

type Estado = { t: 'cargando' } | { t: 'lista'; url: string; vence: string | null; retenida: boolean } | { t: 'sinFoto' } | { t: 'error'; codigo: string };

export function DialogoFotoEvidencia({ eventoId, nombre, onCerrar }: { eventoId: string | null; nombre: string; onCerrar: () => void }) {
  const t = useTranslations('hrmKiosco.foto');
  const { formatDateTime } = useFormatDate();
  const [estado, setEstado] = useState<Estado>({ t: 'cargando' });

  useEffect(() => {
    if (!eventoId) return;
    let vivo = true;
    setEstado({ t: 'cargando' });
    pedir<{ url: string | null; vence?: string | null; retenida?: boolean }>(`/api/hrm/marcacion/fotos/${encodeURIComponent(eventoId)}`)
      .then((r) => vivo && setEstado(r.url ? { t: 'lista', url: r.url, vence: r.vence ?? null, retenida: r.retenida === true } : { t: 'sinFoto' }))
      .catch((e) => vivo && setEstado({ t: 'error', codigo: e instanceof ErrorPersonas ? e.codigo : 'error' }));
    return () => {
      vivo = false;
    };
  }, [eventoId]);

  return (
    <Dialogo
      abierto={eventoId !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo', { nombre })}
      descripcion={t('descripcion')}
      icono={Camera}
      ancho={520}
      primario={{ etiqueta: t('cerrar'), onClick: onCerrar }}
    >
      {estado.t === 'cargando' && <Skeleton className="aspect-[4/3] w-full rounded-lg" />}
      {estado.t === 'lista' && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de 60 s del bucket privado */}
          <img src={estado.url} alt={t('alt', { nombre })} className="aspect-[4/3] w-full rounded-lg bg-subtle object-cover" />
          <p className="text-[13px] text-fg-secondary">
            {estado.retenida ? t('retenida') : estado.vence ? t('vence', { fecha: formatDateTime(estado.vence) }) : null}
          </p>
        </>
      )}
      {estado.t === 'sinFoto' && <AvisoTonal tono="neutro" titulo={t('sinFoto')} />}
      {estado.t === 'error' && <AvisoTonal tono="peligro" rol="alert" titulo={estado.codigo === 'sin_permiso' ? t('sinPermiso') : t('error')} />}
    </Dialogo>
  );
}

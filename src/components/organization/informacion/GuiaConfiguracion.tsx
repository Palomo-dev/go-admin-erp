'use client';

/**
 * «Configura tu organización» (Figma 08, sección 4): cinco pasos —logo,
 * primera sede, invitar al equipo, método de pago y sitio web— con su estado.
 * Cada paso lleva a donde se hace. Cuando todo está listo, la guía se pliega en
 * una línea («Tu organización está lista»).
 *
 * Los datos son lecturas del navegador con la sesión (RLS) y de las mismas
 * fuentes que usan las pantallas de cada paso; el método de pago solo se
 * consulta si la persona tiene permiso de facturación (si no, el paso sale
 * como «Lo hace quien administra la facturación»).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, MinusCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { Tarjeta } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlanSesion } from '@/components/shell/sesion/usePlanSesion';
import { pasosGuia, progresoGuia, type DatosGuia, type PasoGuia } from '@/lib/organizacion/guia';
import { cn } from '@/utils/Utils';

export function GuiaConfiguracion({ organizationId, puedeFacturar }: { organizationId: number; puedeFacturar: boolean }) {
  const t = useTranslations('org.acceso.guia');
  const plan = usePlanSesion();
  const [datos, setDatos] = useState<Omit<DatosGuia, 'miembrosActivos' | 'invitacionesVigentes'> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [org, sedes, sitio, pago] = await Promise.all([
        supabase.from('organizations').select('logo_url').eq('id', organizationId).maybeSingle(),
        supabase.from('branches').select('id, address').eq('organization_id', organizationId).eq('is_active', true),
        supabase.from('website_site_states').select('published_revision_id').eq('organization_id', organizationId).is('branch_id', null).maybeSingle(),
        puedeFacturar
          ? fetch(`/api/subscriptions/payment-methods?organizationId=${organizationId}`, { cache: 'no-store' })
              .then(async (r) => (r.ok ? ((await r.json()) as { paymentMethods?: unknown[] }) : null))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!vivo) return;
      setDatos({
        tieneLogo: !!org.data?.logo_url,
        sedesConDireccion: ((sedes.data ?? []) as { address: string | null }[]).filter((s) => !!s.address?.trim()).length,
        tieneMetodoPago: pago ? (pago.paymentMethods ?? []).length > 0 : null,
        sitioPublicado: sitio.error ? null : !!sitio.data?.published_revision_id,
      });
    })().catch(() => vivo && setDatos({ tieneLogo: false, sedesConDireccion: 0, tieneMetodoPago: null, sitioPublicado: null }));
    return () => {
      vivo = false;
    };
  }, [organizationId, puedeFacturar]);

  if (!datos || !plan.datos) {
    return <Skeleton className="h-40 rounded-xl" aria-hidden="true" />;
  }
  const pasos = pasosGuia({
    ...datos,
    miembrosActivos: plan.datos.uso.usuarios.actual,
    invitacionesVigentes: plan.datos.uso.usuarios.invitacionesVigentes ?? 0,
  });
  const progreso = progresoGuia(pasos);

  if (progreso.completa) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-xl border border-line-success bg-success-subtle px-4 py-3 text-sm text-success-text">
        <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />
        {t('completa')}
      </div>
    );
  }

  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion', { hechos: progreso.hechos, total: progreso.total })} icono={Sparkles}>
      <div
        role="progressbar"
        aria-label={t('titulo')}
        aria-valuemin={0}
        aria-valuemax={progreso.total}
        aria-valuenow={progreso.hechos}
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-brand-action" style={{ width: `${progreso.total ? (progreso.hechos / progreso.total) * 100 : 0}%` }} />
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {pasos.map((p) => (
          <FilaPaso key={p.clave} paso={p} />
        ))}
      </ol>
    </Tarjeta>
  );
}

function FilaPaso({ paso }: { paso: PasoGuia }) {
  const t = useTranslations('org.acceso.guia');
  const Icono = paso.estado === 'hecho' ? CheckCircle2 : paso.estado === 'pendiente' ? Circle : MinusCircle;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icono
          aria-hidden="true"
          className={cn('mt-0.5 size-5 shrink-0', paso.estado === 'hecho' ? 'text-success' : paso.estado === 'pendiente' ? 'text-fg-muted' : 'text-fg-muted opacity-60')}
          strokeWidth={1.5}
        />
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', paso.estado === 'hecho' ? 'text-fg-secondary line-through decoration-1' : 'text-fg')}>{t(`pasos.${paso.clave}.titulo`)}</p>
          <p className="text-[13px] text-fg-secondary">
            {paso.estado === 'noDisponible' ? t(`pasos.${paso.clave}.noDisponible`) : t(`pasos.${paso.clave}.descripcion`)}
          </p>
          <span className="sr-only">{t(`estados.${paso.estado}`)}</span>
        </div>
      </div>
      {paso.estado === 'pendiente' && (
        <Link
          href={paso.href}
          className="shrink-0 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t(`pasos.${paso.clave}.accion`)}
        </Link>
      )}
    </li>
  );
}

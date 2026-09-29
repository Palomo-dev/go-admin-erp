'use client';

/**
 * «Completa los datos de tu empresa» (acceso v3, fase 7; Figma sección 18,
 * fila 9, nodo 1170:744210).
 *
 * Se muestra en Inicio a quien administra la organización (super admin o rol
 * 1/2) mientras falte el NIT, la ciudad o la dirección. Lleva a Organización ›
 * Información y desaparece sola al completarlos (se vuelve a leer al cambiar de
 * organización). Al activar la facturación electrónica se exigen los tres
 * (`datosEmpresaFaltantes`, la misma regla en el servidor).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { clasesBoton } from '@/components/kit/botonClases';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import {
  COLUMNAS_DATOS_EMPRESA,
  datosEmpresaFaltantes,
  type DatoEmpresa,
  type OrganizacionDatosEmpresa,
} from '@/lib/organizacion/datosEmpresa';

interface TarjetaDatosEmpresaProps {
  organizationId: number | null | undefined;
  /** Rol resuelto en el contexto de permisos; sin él la tarjeta no se pinta. */
  permContext: { roleId: number; isSuperAdmin?: boolean } | null | undefined;
}

export function TarjetaDatosEmpresa({ organizationId, permContext }: TarjetaDatosEmpresaProps) {
  const t = useTranslations('home.datosEmpresa');
  const locale = useLocale();
  const [faltan, setFaltan] = useState<DatoEmpresa[]>([]);
  const esAdmin = !!permContext && isOrgAdminLike({ roleId: permContext.roleId, isSuperAdmin: permContext.isSuperAdmin === true });

  useEffect(() => {
    setFaltan([]);
    if (!organizationId || !esAdmin) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(COLUMNAS_DATOS_EMPRESA)
        .eq('id', organizationId)
        .maybeSingle();
      // Si no se puede leer, no se molesta con una tarjeta que podría ser falsa.
      if (!vivo || error || !data) return;
      setFaltan(datosEmpresaFaltantes(data as OrganizacionDatosEmpresa));
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId, esAdmin]);

  if (!esAdmin || faltan.length === 0) return null;

  const lista = new Intl.ListFormat(locale, { type: 'conjunction' }).format(faltan.map((f) => t(`campo.${f}`)));

  return (
    <section
      aria-labelledby="tarjeta-datos-empresa-titulo"
      className="flex flex-col gap-4 rounded-xl border border-brand bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand" aria-hidden="true">
        <Building2 className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="tarjeta-datos-empresa-titulo" className="text-base font-semibold text-fg">
          {t('titulo')}
        </h2>
        <p className="mt-1 text-sm text-fg-secondary">{t('descripcion', { campos: lista, cantidad: faltan.length })}</p>
      </div>
      <Link href="/app/organizacion/informacion" className={clasesBoton({ variante: 'primario', className: 'shrink-0 self-start sm:self-center' })}>
        {t('accion')}
      </Link>
    </section>
  );
}

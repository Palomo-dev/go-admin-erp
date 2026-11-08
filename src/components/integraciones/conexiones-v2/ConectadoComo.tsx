'use client';

/**
 * «Conectado como …» (pedido del dueño, 2026-11-07: «antes uno podía probar conexión y le decía si
 * estaba conectada y bajo qué nombre»). Muestra lo que el PROVEEDOR dijo de la cuenta dueña de las
 * llaves en la última prueba correcta: nombre, razón social, documento, correo, país, ambiente y
 * métodos habilitados. Nunca secretos.
 */
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import type { CuentaVerificada } from '@/lib/services/integrations/conexiones/clienteConexiones';

export interface ConectadoComoProps {
  cuenta: CuentaVerificada;
  /** Texto adicional (p. ej. «verificado el …»). */
  nota?: string | null;
}

export function ConectadoComo({ cuenta, nota }: ConectadoComoProps) {
  const t = useTranslations('integracionesConexiones');
  const filas: [string, string][] = [];
  if (cuenta.razonSocial && cuenta.razonSocial !== cuenta.nombre) filas.push([t('conectadoComo.razonSocial'), cuenta.razonSocial]);
  if (cuenta.documento) filas.push([t('conectadoComo.documento'), cuenta.documento]);
  if (cuenta.correo) filas.push([t('conectadoComo.correo'), cuenta.correo]);
  if (cuenta.pais) filas.push([t('conectadoComo.pais'), cuenta.pais]);
  if (cuenta.ambiente) filas.push([t('conectadoComo.ambiente'), cuenta.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas')]);
  if (cuenta.metodos && cuenta.metodos.length > 0) filas.push([t('conectadoComo.metodos'), cuenta.metodos.join(' · ')]);
  return (
    <div role="status" className="rounded-lg border border-line bg-subtle px-3 py-2">
      <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success-text" />
        {t('conectadoComo.titulo', { nombre: cuenta.nombre })}
      </p>
      {filas.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] leading-[18px]">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="contents">
              <dt className="text-fg-secondary">{etiqueta}</dt>
              <dd className="min-w-0 break-words text-fg">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {nota && <p className="mt-1 text-[13px] text-fg-secondary">{nota}</p>}
    </div>
  );
}

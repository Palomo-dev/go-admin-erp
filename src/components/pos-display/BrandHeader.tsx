'use client';

/**
 * Cabecera con la marca del comercio (logo + nombre) y, a la derecha, quién
 * atiende. En Conectando se pinta en gris (PLAN §4.2).
 */

import { useTranslations } from 'next-intl';
import type { DisplayBrand } from './useDisplayBrand';

interface BrandHeaderProps {
  brand: DisplayBrand;
  cashierName: string | null;
  /**
   * Nombre del cliente de la venta (F4, ajuste `showCustomerName`). La raíz
   * ya decide si se pasa: aquí solo se pinta. Apagado por defecto en los
   * ajustes, así que lo normal es que llegue null.
   */
  customerName?: string | null;
  muted?: boolean;
}

export function BrandLogo({ brand, className = '' }: { brand: DisplayBrand; className?: string }) {
  if (brand.logoUrl) {
    // Logo externo de la organización: <img> a propósito (next/image exigiría
    // registrar cada dominio de logos y aquí no hay optimización que valga).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt="" className={`object-contain ${className}`} />;
  }
  const initial = brand.name.trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-2xl font-semibold text-white ${className}`}
      style={{ backgroundColor: brand.primaryColor }}
    >
      {initial || '•'}
    </div>
  );
}

export function BrandHeader({ brand, cashierName, customerName = null, muted = false }: BrandHeaderProps) {
  const t = useTranslations('posDisplay');
  return (
    <header
      className={`flex items-center justify-between gap-6 border-b border-neutral-200 px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.5)] ${muted ? 'grayscale opacity-60' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <BrandLogo brand={brand} className="h-[var(--pd-logo)] w-[var(--pd-logo)] shrink-0 text-[calc(var(--pd-logo)*0.5)]" />
        <h1 className="truncate text-[length:var(--pd-heading)] font-semibold uppercase tracking-wide text-neutral-900">
          {brand.name}
        </h1>
      </div>
      {customerName || cashierName ? (
        <div className="flex min-w-0 shrink-0 flex-col items-end text-[length:var(--pd-small)] text-neutral-500">
          {customerName ? (
            <p className="max-w-[40vw] truncate font-medium text-neutral-700" data-customer-name="true">
              {t('customer', { name: customerName })}
            </p>
          ) : null}
          {cashierName ? <p className="truncate">{t('cashier', { name: cashierName })}</p> : null}
        </div>
      ) : null}
    </header>
  );
}

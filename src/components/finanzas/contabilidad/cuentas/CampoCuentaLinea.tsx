'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CampoCuentaAutomatica } from '@/components/kit/CampoCuentaAutomatica';
import type { ConsultaCuenta, DocumentoCuenta } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { buscarCuentas } from './CuentasAutomaticasService';
import { useCuentasEfectivas } from './useCuentasEfectivas';

/** Una línea suelta: el documento soporte, que no usa `DocumentoLineas`. */
export function CampoCuentaLinea({
  documento,
  branchId,
  productId,
  valor,
  onCambiar,
}: {
  documento: DocumentoCuenta;
  branchId: number | null | undefined;
  productId: number | null | undefined;
  valor: string | null | undefined;
  onCambiar: (cuenta: string | null) => void;
}) {
  const t = useTranslations('cuentasAutomaticas');
  const consultas = useMemo<ConsultaCuenta[]>(
    () => [{ clave: 'linea', product_id: productId ?? null, cuenta_contable: valor ?? null }],
    [productId, valor],
  );
  const { porClave, cargando } = useCuentasEfectivas(branchId, documento, consultas);
  return (
    <CampoCuentaAutomatica
      etiqueta={t('cuentaContable')}
      efectiva={porClave.get('linea') ?? null}
      cargando={cargando}
      propia={!!valor?.trim()}
      onCambiar={onCambiar}
      buscar={buscarCuentas}
    />
  );
}

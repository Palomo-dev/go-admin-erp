'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CampoCuentaAutomatica } from '@/components/kit/CampoCuentaAutomatica';
import { ResumenCuentas } from '@/components/kit/ResumenCuentas';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { ROLES_CUENTA, type ConsultaCuenta, type RolCuenta } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { buscarCuentas } from './CuentasAutomaticasService';
import { useCuentasEfectivas } from './useCuentasEfectivas';

export interface BloqueCuentasCatalogoProps {
  sujeto: 'producto' | 'categoria';
  /** Lo que hay en el formulario, guardado o no. */
  valores: Record<RolCuenta, string | null | undefined>;
  onCambiar: (rol: RolCuenta, cuenta: string | null) => void;
  /** De quién hereda: la categoría del producto, o el padre de la categoría. */
  categoriaId: number | null | undefined;
}

/**
 * Las cuatro cuentas de un producto o una categoría, cerradas por defecto.
 * Pregunta con lo que hay en el formulario, no con lo guardado: así la pantalla
 * responde a medida que se cambia la categoría o se elige una cuenta.
 */
export function BloqueCuentasCatalogo({ sujeto, valores, onCambiar, categoriaId }: BloqueCuentasCatalogoProps) {
  const t = useTranslations('cuentasAutomaticas');
  const sede = useBranchOpcional();
  const [abierto, setAbierto] = useState(false);
  const consultas = useMemo<ConsultaCuenta[]>(
    () => ROLES_CUENTA.map((rol) => ({ clave: rol, rol, category_id: categoriaId ?? null, cuenta_contable: valores[rol] ?? null })),
    [categoriaId, valores],
  );
  const { porClave, lista, cargando } = useCuentasEfectivas(sede?.selectedBranchId ?? null, 'catalogo', consultas);

  return (
    <ResumenCuentas cuentas={lista} cargando={cargando} abierto={abierto} onAbiertoChange={setAbierto} sujeto={sujeto}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">{t('resumen.siNoCambias')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ROLES_CUENTA.map((rol) => (
            <CampoCuentaAutomatica
              key={rol}
              etiqueta={t(`rolCuenta.${rol}`)}
              efectiva={porClave.get(rol) ?? null}
              cargando={cargando}
              propia={!!valores[rol]?.trim()}
              onCambiar={(cuenta) => onCambiar(rol, cuenta)}
              buscar={buscarCuentas}
            />
          ))}
        </div>
        <p className="text-xs text-fg-muted">{t('resumen.dondeAplica')}</p>
      </div>
    </ResumenCuentas>
  );
}

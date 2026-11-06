'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChipsOpcion, Dialogo } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { codigoNormalizado } from '@/lib/finanzas/pucPrefijo';
import type { CuentaConValor } from '@/lib/finanzas/estados/tipos';
import { ErrorServidor, guardarCuentasFlujo } from './clienteEstados';

const CATEGORIAS = ['operacion', 'inversion', 'financiacion'] as const;
type Categoria = (typeof CATEGORIAS)[number];

/**
 * El Contador decide la categoría. Se puede marcar la cuenta, su cuenta de
 * cuatro dígitos o todo el grupo: los auxiliares heredan la marca más precisa.
 */
export function ClasificarCuentaDialogo({
  cuenta,
  onCerrar,
  onGuardado,
}: {
  cuenta: CuentaConValor | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('estadosFinancieros.clasificar');
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [alcance, setAlcance] = useState('');
  const [guardando, setGuardando] = useState(false);

  const codigo = cuenta ? codigoNormalizado(cuenta.cuenta) : '';
  const alcances = cuenta
    ? [...new Set([cuenta.cuenta, ...(codigo.length > 4 ? [codigo.slice(0, 4)] : []), ...(codigo.length > 2 ? [codigo.slice(0, 2)] : [])])]
    : [];

  useEffect(() => {
    setCategoria(null);
    setAlcance(cuenta?.cuenta ?? '');
  }, [cuenta]);

  const guardar = async () => {
    if (!categoria) return;
    setGuardando(true);
    try {
      await guardarCuentasFlujo([{ account_code: alcance, categoria_flujo: categoria }]);
      toastSuccess(t('guardado'));
      onGuardado();
    } catch (error) {
      console.error('No se pudo clasificar la cuenta:', error);
      const codigoError = error instanceof ErrorServidor ? error.codigo : '';
      toastError(t(codigoError === 'sin_permiso' ? 'sinPermiso' : codigoError === 'cuenta_no_pertenece_organizacion' ? 'sinCuenta' : 'error'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!cuenta}
      onAbiertoChange={(abierto) => { if (!abierto) onCerrar(); }}
      titulo={t('titulo', { cuenta: cuenta?.cuenta ?? '' })}
      descripcion={cuenta?.nombre ?? undefined}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !categoria }}
      ancho={520}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-fg">{t('categoria')}</p>
          <ChipsOpcion
            etiqueta={t('categoria')}
            opciones={CATEGORIAS.map((c) => ({ valor: c, etiqueta: t(`categorias.${c}`) }))}
            valor={categoria}
            onValorChange={(v) => setCategoria(v as Categoria)}
          />
          <p className="text-xs text-fg-secondary">{t('ayuda')}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-fg">{t('alcance')}</p>
          <ChipsOpcion
            etiqueta={t('alcance')}
            opciones={alcances.map((a) => ({ valor: a, etiqueta: a }))}
            valor={alcance}
            onValorChange={(v) => setAlcance(v)}
          />
        </div>
      </div>
    </Dialogo>
  );
}

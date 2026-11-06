'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { useOrigenCuenta } from '@/components/kit/CampoCuentaAutomatica';
import { SelectorCuenta, type OpcionCuenta } from '@/components/kit/SelectorCuenta';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  cambioDeCuentaLinea,
  type AlcanceCuenta,
  type CambioCuentaLinea,
  type CuentaEfectiva,
  type SugerenciaCuenta,
} from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { buscarCuentas, CuentasAutomaticasService } from './CuentasAutomaticasService';

export interface DialogoCuentaLineaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  descripcionLinea: string;
  efectiva: CuentaEfectiva | undefined;
  cargando?: boolean;
  productoId: number | null;
  sugerencia?: SugerenciaCuenta | null;
  /** La línea del formulario: se llama cuando el catálogo ya quedó guardado. */
  onAplicar: (cambio: CambioCuentaLinea) => void;
}

const TONO = { automatica: 'exito', categoria: 'informacion', propia: 'marca', titulo: 'advertencia', sin_cuenta: 'peligro' } as const;

/** Figma «Cuenta de la línea» (2325:124530): cambia la cuenta y dice hasta dónde. */
export function DialogoCuentaLinea({
  abierto,
  onAbiertoChange,
  descripcionLinea,
  efectiva,
  cargando,
  productoId,
  sugerencia,
  onAplicar,
}: DialogoCuentaLineaProps) {
  const t = useTranslations('cuentasAutomaticas');
  const origenDe = useOrigenCuenta();
  const idCambiar = useId();
  const [elegida, setElegida] = useState<OpcionCuenta | null>(null);
  const [alcance, setAlcance] = useState<AlcanceCuenta>('documento');
  const [productosCategoria, setProductosCategoria] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const categoriaId = efectiva?.categoriaId ?? null;
  const conProducto = productoId != null;

  useEffect(() => {
    if (!abierto) return;
    setElegida(null);
    setAlcance('documento');
    setProductosCategoria(null);
  }, [abierto]);

  useEffect(() => {
    if (!abierto || categoriaId == null || !conProducto) return;
    let vivo = true;
    CuentasAutomaticasService.productosDeCategoria(categoriaId)
      .then((n) => vivo && setProductosCategoria(n))
      .catch(() => vivo && setProductosCategoria(null));
    return () => {
      vivo = false;
    };
  }, [abierto, categoriaId, conProducto]);

  const aplicar = async (cuenta: string | null) => {
    const cambio = cambioDeCuentaLinea({ alcance, cuenta, rol: efectiva?.rol ?? 'ingreso', productoId, categoriaId });
    setGuardando(true);
    try {
      if (cambio.catalogo) {
        const { tipo, id, rol, cuenta: destino } = cambio.catalogo;
        await CuentasAutomaticasService.fijarEnCatalogo(tipo, id, rol, destino);
      }
      onAplicar(cambio);
      onAbiertoChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('dialogo.titulo')}
      descripcion={descripcionLinea}
      ancho={560}
      icono={Landmark}
      pie={
        <button
          type="button"
          disabled={guardando}
          onClick={() => void aplicar(null)}
          className="text-sm font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          {t('accion.volverAutomatica')}
        </button>
      }
      primario={{
        etiqueta: t('dialogo.aplicar'),
        cargando: guardando,
        deshabilitada: !elegida,
        motivo: elegida ? undefined : t('dialogo.eligeCuenta'),
        onClick: () => void aplicar(elegida?.account_code ?? null),
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-fg">{t('dialogo.hoySeUsa')}</span>
            {efectiva && <StatusBadge estado={efectiva.estado} etiqueta={t(`estado.${efectiva.estado}`)} tono={TONO[efectiva.estado]} apariencia="suave" />}
          </div>
          {cargando && !efectiva ? (
            <Skeleton className="h-[60px] w-full rounded-lg" />
          ) : (
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <p className="text-sm text-fg">
                <span className="font-medium tabular-nums">{efectiva?.cuenta ?? t('estado.sin_cuenta')}</span>
                {efectiva?.nombre ? <span className="ml-2">{efectiva.nombre}</span> : null}
              </p>
              {efectiva && <p className="text-xs text-fg-secondary">{origenDe(efectiva)}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idCambiar}>{t('dialogo.cambiarPor')}</Label>
          <SelectorCuenta id={idCambiar} valor={elegida} onCambiar={setElegida} buscar={buscarCuentas} etiqueta={t('dialogo.cambiarPor')} />
          <p className="text-xs text-fg-muted">{t('dialogo.ayudaBuscar')}</p>
          {sugerencia && !elegida && (
            <p className="text-xs text-fg-secondary">
              {t('sugerencia.texto', { cuenta: sugerencia.cuenta, nombre: sugerencia.nombre, veces: sugerencia.veces, compras: sugerencia.compras })}{' '}
              <button
                type="button"
                className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() => setElegida({ account_code: sugerencia.cuenta, name: sugerencia.nombre })}
              >
                {t('sugerencia.usar')}
              </button>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('dialogo.dondeAplicar')}</span>
          <RadioGroup value={alcance} onValueChange={(v) => setAlcance(v as AlcanceCuenta)}>
            <AlcanceOpcion valor="documento" etiqueta={t('alcance.documento')} />
            {conProducto && <AlcanceOpcion valor="producto" etiqueta={t('alcance.producto')} />}
            {conProducto && categoriaId != null && (
              <AlcanceOpcion
                valor="categoria"
                etiqueta={
                  productosCategoria == null
                    ? t('alcance.categoria', { nombre: efectiva?.categoriaNombre ?? '' })
                    : t('alcance.categoriaConProductos', { nombre: efectiva?.categoriaNombre ?? '', n: productosCategoria })
                }
              />
            )}
          </RadioGroup>
          {alcance !== 'documento' && <p className="text-xs text-fg-muted">{t('alcance.aviso')}</p>}
        </div>
      </div>
    </Dialogo>
  );
}

function AlcanceOpcion({ valor, etiqueta }: { valor: AlcanceCuenta; etiqueta: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={valor} />
      <Label htmlFor={id} className="font-normal">
        {etiqueta}
      </Label>
    </div>
  );
}

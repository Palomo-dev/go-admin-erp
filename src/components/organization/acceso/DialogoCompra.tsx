'use client';

/**
 * «Comprar usuarios / sucursales / créditos de IA» (Figma 08, sección 9), un
 * solo diálogo para los tres. Sustituye a `BuyUsersModal`, `BuyBranchesModal`
 * y `BuyAiCreditsModal`, que tenían los textos cableados, precios propios
 * distintos de los que cobraba el servidor y solo dos estados.
 *
 * Fases: elegir (paquete o cantidad + desglose) → procesando (redirección a la
 * pasarela; «Cancelar» bloqueado) → error (alerta y «Reintentar») · éxito (al
 * volver de la pasarela) · el plan no lo permite (con salida a Plan).
 *
 * El precio sale de `GET /api/organizacion/compras/precio`, que usa la misma
 * función que el cobro (`src/lib/stripe/preciosCompras.ts`).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, CheckCircle2, Loader2, Sparkles, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { CampoNumero, FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import {
  cantidadValida,
  desgloseCompra,
  motivoNoPermite,
  type EstadoPlan,
  type FaseCompra,
  type TipoCompra,
} from '@/lib/organizacion/plan';

const PAQUETES: Record<TipoCompra, readonly number[]> = {
  usuarios: [5, 10, 25, 50],
  sucursales: [1, 3, 5, 10],
  creditos: [5000, 15000, 50000, 100000],
};

const ICONO = { usuarios: UserPlus, sucursales: Building2, creditos: Sparkles } as const;

interface PrecioTipo {
  unitarioCentavos: number;
  moneda: string;
  minimo: number;
  maximo: number | null;
}

export interface DialogoCompraProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tipo: TipoCompra;
  organizationId: number;
  estadoPlan: EstadoPlan;
  /** Tope actual (usuarios o sucursales); `null` = ilimitado. Ignorado en créditos. */
  maximo?: number | null;
  /** «8 de 10 usados» o, en créditos, el saldo. */
  resumenActual?: string;
  /** Abrir directamente en un estado (al volver de la pasarela: `exito`). */
  faseInicial?: FaseCompra;
}

export function DialogoCompra({
  abierto,
  onAbiertoChange,
  tipo,
  organizationId,
  estadoPlan,
  maximo,
  resumenActual,
  faseInicial,
}: DialogoCompraProps) {
  const t = useTranslations('org.acceso.compras');
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const noPermite = motivoNoPermite(tipo, estadoPlan, maximo);
  const [fase, setFase] = useState<FaseCompra>('elegir');
  const [cantidad, setCantidad] = useState<number | null>(PAQUETES[tipo][1]);
  const [precio, setPrecio] = useState<PrecioTipo | null>(null);
  const [errorPrecio, setErrorPrecio] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setFase(faseInicial ?? (noPermite ? 'noPermite' : 'elegir'));
    setCantidad(PAQUETES[tipo][1]);
    setMensajeError(null);
  }, [abierto, faseInicial, noPermite, tipo]);

  useEffect(() => {
    if (!abierto || precio || errorPrecio) return;
    let vivo = true;
    fetch('/api/organizacion/compras/precio', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const json = (await r.json()) as Record<TipoCompra, PrecioTipo>;
        if (vivo) setPrecio(json[tipo]);
      })
      .catch(() => vivo && setErrorPrecio(true));
    return () => {
      vivo = false;
    };
  }, [abierto, precio, errorPrecio, tipo]);

  const minimo = precio?.minimo ?? (tipo === 'creditos' ? 100 : 1);
  const maximoCompra = precio?.maximo ?? null;
  const valida = cantidad !== null && cantidadValida(cantidad, minimo, maximoCompra);
  const desglose = desgloseCompra(cantidad ?? 0, precio?.unitarioCentavos ?? null);
  const dinero = useMemo(() => {
    const moneda = (precio?.moneda ?? 'usd').toUpperCase();
    // Precios de cupo en centavos (USD hoy): se muestran con 2 decimales, y el
    // crédito suelto (4 centavos) con los que haga falta.
    return (centavos: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(centavos / 100);
  }, [precio?.moneda, locale]);

  const comprar = async () => {
    if (!valida || cantidad === null) return;
    setFase('procesando');
    setMensajeError(null);
    try {
      const respuesta = await fetch(tipo === 'creditos' ? '/api/stripe/purchase-ai-credits' : '/api/stripe/create-addon-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          tipo === 'creditos'
            ? { organizationId, creditsAmount: cantidad }
            : { organizationId, addonType: tipo === 'usuarios' ? 'extra_users' : 'extra_branches', quantity: cantidad }
        ),
      });
      const json = (await respuesta.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!respuesta.ok || !json.url) {
        setMensajeError(respuesta.status === 403 ? t('error.sinPermiso') : json.error ?? null);
        setFase('error');
        return;
      }
      // Se queda en «procesando» mientras el navegador va a la pasarela.
      window.location.href = json.url;
    } catch {
      setMensajeError(null);
      setFase('error');
    }
  };

  const ocupado = fase === 'procesando';
  const titulo = t(`titulo.${tipo}`);
  const Icono = ICONO[tipo];

  const pie = (() => {
    switch (fase) {
      case 'elegir':
        return (
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)}>
              {t('cancelar')}
            </button>
            <button type="button" className={clasesBoton()} onClick={() => void comprar()} disabled={!valida || !precio}>
              {desglose.total !== null && valida ? t('pagar', { total: dinero(desglose.total) }) : t('continuar')}
            </button>
          </>
        );
      case 'procesando':
        return (
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled title={t('procesando.noCancelar')}>
              {t('cancelar')}
            </button>
            <button type="button" className={clasesBoton()} disabled aria-busy="true">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t('procesando.boton')}
            </button>
          </>
        );
      case 'error':
        return (
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)}>
              {t('cerrar')}
            </button>
            <button type="button" className={clasesBoton()} onClick={() => setFase('elegir')}>
              {t('error.reintentar')}
            </button>
          </>
        );
      case 'noPermite':
        return (
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)}>
              {t('cerrar')}
            </button>
            <Link href="/app/organizacion/plan" className={clasesBoton()} onClick={() => onAbiertoChange(false)}>
              {t('noPermite.verPlanes')}
            </Link>
          </>
        );
      default:
        return (
          <button type="button" className={clasesBoton()} onClick={() => onAbiertoChange(false)}>
            {t('exito.listo')}
          </button>
        );
    }
  })();

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={t(`descripcion.${tipo}`)}
      icono={Icono}
      ancho={560}
      ocupado={ocupado}
      bloquearClicFuera={ocupado}
      pie={pie}
    >
      {fase === 'exito' && (
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 aria-hidden="true" className="size-12 text-success" strokeWidth={1.5} />
          <p className="text-base font-semibold text-fg">{t('exito.titulo')}</p>
          <p className="max-w-sm text-sm text-fg-secondary">{t(`exito.descripcion.${tipo}`)}</p>
        </div>
      )}

      {fase === 'noPermite' && noPermite && (
        <div role="status" className="flex gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-warning-text">{t('noPermite.titulo')}</p>
            <p className="text-[13px] text-fg-secondary">{t(`noPermite.${noPermite}`)}</p>
          </div>
        </div>
      )}

      {fase === 'error' && (
        <div role="alert" className="flex gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger-text" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-danger-text">{t('error.titulo')}</p>
            <p className="text-[13px] text-fg-secondary">{mensajeError ?? t('error.descripcion')}</p>
          </div>
        </div>
      )}

      {(fase === 'elegir' || fase === 'procesando' || fase === 'error') && (
        <fieldset disabled={ocupado} className="flex flex-col gap-4">
          <legend className="sr-only">{t('paquetes')}</legend>
          {resumenActual && <p className="text-[13px] text-fg-secondary">{resumenActual}</p>}
          <div className="grid grid-cols-2 gap-2">
            {PAQUETES[tipo].map((n) => {
              const activo = cantidad === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setCantidad(n)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activo ? 'border-brand bg-brand-tint' : 'border-line hover:bg-hover',
                  )}
                >
                  <span className="text-sm font-semibold text-fg">{t(`paquete.${tipo}`, { n: entero(n) })}</span>
                  <span className="text-[13px] tabular-nums text-fg-secondary">
                    {precio ? t(tipo === 'creditos' ? 'precioUnico' : 'precioMes', { precio: dinero(n * precio.unitarioCentavos) }) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          <FormField etiqueta={t('cantidad')} ayuda={t('cantidadAyuda', { minimo: entero(minimo) })}>
            <CampoNumero valor={cantidad} onValorChange={setCantidad} decimales={0} minimo={minimo} maximo={maximoCompra ?? undefined} alinear="izquierda" />
          </FormField>

          <dl className="flex flex-col gap-2 rounded-xl bg-subtle p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t(`desglose.cantidad.${tipo}`)}</dt>
              <dd className="tabular-nums text-fg">{entero(desglose.cantidad)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t('desglose.unitario')}</dt>
              <dd className="tabular-nums text-fg">{desglose.unitario !== null ? dinero(desglose.unitario) : errorPrecio ? t('desglose.sinPrecio') : '…'}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
              <dt className="text-fg">{t(tipo === 'creditos' ? 'desglose.totalUnico' : 'desglose.totalMes')}</dt>
              <dd className="tabular-nums text-fg">{desglose.total !== null && valida ? dinero(desglose.total) : '—'}</dd>
            </div>
            <p className="text-xs text-fg-secondary">{t(tipo === 'creditos' ? 'desglose.notaUnico' : 'desglose.notaMes')}</p>
          </dl>
          {ocupado && (
            <p role="status" className="text-[13px] text-fg-secondary">
              {t('procesando.descripcion')}
            </p>
          )}
        </fieldset>
      )}
    </PanelAdaptable>
  );
}

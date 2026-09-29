'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import { CampoNumero, Dialogo, FilaDato, FormField } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ErrorProduccion,
  nuevaClaveProduccion,
  productionOrderService,
  type FaltanteProduccion,
  type NecesidadesProduccion,
  type OrdenProduccionFila,
  type ResultadoCompletar,
} from '@/lib/services/productionOrderService';
import { maximoProducible, validarCantidadProducida } from './logica';
import { useFormatoCantidad, useMensajeErrorProduccion } from './piezas';

/**
 * «Completar orden» (Figma G2 970:177176 y 604:158843; sustituye al `prompt()`):
 * cantidad producida (> 0, ≤ 150 % y con los decimales del producto), qué entra
 * y qué sale, costo real estimado y, si algún ingrediente queda en negativo,
 * una casilla de confirmación. Completa en UNA transacción del servidor; si
 * falla, la orden sigue como estaba y aquí se muestra el motivo.
 */
export interface DialogoCompletarOrdenProps {
  orden: OrdenProduccionFila | null;
  onAbiertoChange: (abierto: boolean) => void;
  onCompletada: (r: ResultadoCompletar) => void;
}

export function DialogoCompletarOrden({ orden, onAbiertoChange, onCompletada }: DialogoCompletarOrdenProps) {
  const t = useTranslations('inventarioProduccion.completar');
  const cantidadFmt = useFormatoCantidad();
  const mensajeError = useMensajeErrorProduccion();
  const { formatear: moneda } = useMonedaOrganizacion();
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [necesidades, setNecesidades] = useState<NecesidadesProduccion | null>(null);
  const [faltantesServidor, setFaltantesServidor] = useState<FaltanteProduccion[]>([]);
  const [entiendo, setEntiendo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState('');

  useEffect(() => {
    if (!orden) return;
    setCantidad(orden.a_producir);
    setEntiendo(false);
    setError(null);
    setFaltantesServidor([]);
    setClave(nuevaClaveProduccion('completar', orden.id));
    setNecesidades(null);
    const control = new AbortController();
    productionOrderService
      .necesidades(getOrganizationId(), orden.sucursal.id, orden.receta.id, orden.a_producir, control.signal)
      .then(setNecesidades)
      .catch(() => {
        if (!control.signal.aborted) setNecesidades(null);
      });
    return () => control.abort();
  }, [orden]);

  const errorCantidad = orden ? validarCantidadProducida(cantidad, orden.a_producir, orden.producto.decimales) : null;
  const factor = orden && orden.a_producir > 0 && cantidad ? cantidad / orden.a_producir : 0;

  // Faltantes con lo que se va a producir (el consumo es proporcional a lo producido).
  const faltantes = useMemo(() => {
    if (faltantesServidor.length > 0) return faltantesServidor;
    if (!necesidades || !factor) return [];
    return necesidades.lineas
      .filter((l) => l.track_stock && !l.opcional && !l.error)
      .map((l) => ({ product_id: l.ingredient_product_id, nombre: l.nombre, unidad: l.unidad, necesario: l.necesario * factor, disponible: l.disponible, faltante: l.necesario * factor - l.disponible }))
      .filter((l) => l.faltante > 0.0005);
  }, [necesidades, factor, faltantesServidor]);

  const costoEstimado = necesidades?.costo_unidad !== null && necesidades?.costo_unidad !== undefined && cantidad ? necesidades.costo_unidad * cantidad : null;
  const ingredientes = necesidades?.lineas.filter((l) => !l.opcional).length ?? null;
  const requiereConfirmar = faltantes.length > 0;

  if (!orden) return null;
  const unidad = orden.producto.unidad;

  const completar = async () => {
    if (errorCantidad || cantidad === null) return;
    setTrabajando(true);
    setError(null);
    try {
      const r = await productionOrderService.completar(orden.id, cantidad, { confirmarFaltante: requiereConfirmar && entiendo, clave });
      onCompletada(r);
      onAbiertoChange(false);
    } catch (e) {
      if (e instanceof ErrorProduccion && e.clave === 'faltante_sin_confirmar') {
        setFaltantesServidor(e.faltantes);
        setEntiendo(false);
      }
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const textoError = errorCantidad
    ? t(`errores.${errorCantidad}`, { maximo: cantidadFmt(maximoProducible(orden.a_producir), unidad), decimales: orden.producto.decimales })
    : null;

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !trabajando && onAbiertoChange(a)}
      titulo={t('titulo', { numero: orden.numero })}
      descripcion={t('descripcion', { sucursal: orden.sucursal.nombre })}
      icono={CircleCheck}
      ancho={520}
      primario={{
        etiqueta: t('confirmar'),
        onClick: completar,
        cargando: trabajando,
        deshabilitada: !!errorCantidad || (requiereConfirmar && !entiendo),
        motivo: errorCantidad ? textoError ?? undefined : requiereConfirmar && !entiendo ? t('marcaEntiendo') : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          etiqueta={t('cantidad')}
          id="completar-cantidad"
          error={cantidad !== null && errorCantidad ? textoError : null}
          ayuda={t('ayuda', {
            planeado: cantidadFmt(orden.a_producir, unidad),
            maximo: cantidadFmt(maximoProducible(orden.a_producir), unidad),
          })}
        >
          <CampoNumero
            valor={cantidad}
            onValorChange={(v) => {
              setCantidad(v);
              setFaltantesServidor([]);
            }}
            decimales={orden.producto.decimales}
            minimo={0}
            sufijo={unidad}
            alinear="derecha"
            autoFocus
          />
        </FormField>

        <div className="rounded-xl bg-subtle px-4 py-3">
          <FilaDato etiqueta={t('entra')} valor={t('entraValor', { cantidad: cantidadFmt(cantidad ?? 0, unidad), producto: orden.producto.nombre })} />
          <FilaDato
            etiqueta={t('salen')}
            valor={ingredientes === null ? '…' : t('salenValor', { count: ingredientes, version: orden.receta.version })}
          />
          {costoEstimado !== null && (
            <FilaDato
              etiqueta={t('costoReal')}
              valor={t('costoRealValor', { total: moneda(costoEstimado), unidad: moneda(necesidades?.costo_unidad ?? 0) })}
            />
          )}
          {faltantes.map((f) => (
            <FilaDato
              key={f.product_id}
              etiqueta={t('quedaNegativo')}
              tono="peligro"
              valor={t('quedaNegativoValor', { nombre: f.nombre, cantidad: cantidadFmt(-(f.faltante), f.unidad) })}
            />
          ))}
        </div>

        {requiereConfirmar && (
          <label className="flex items-start gap-2 text-sm text-fg">
            <Checkbox checked={entiendo} onCheckedChange={(v) => setEntiendo(v === true)} className="mt-0.5 size-[18px] rounded" />
            <span>{t('entiendo', { count: faltantes.length, nombre: faltantes[0]?.nombre ?? '' })}</span>
          </label>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Dialogo>
  );
}

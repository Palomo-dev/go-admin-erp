'use client';

/**
 * Condiciones del contrato de consignación — UNA pieza para recibir a mano (R4)
 * y para la nueva nota entregada. Criterio del Contador (Ronda 2): el contrato
 * separa la modalidad jurídica, la condición contable y el tratamiento
 * tributario; nada tiene valor por defecto y, si falta algo, el diálogo no deja
 * operar. La compra real no es consignación (se ofrece la factura). El
 * estimatorio se puede elegir pero queda bloqueado hasta parametrizar los arts.
 * 438 y 455. IVA y retenciones NO se eligen aquí: se determinan por ley.
 * Ronda 3: la comisión se reconoce cuando se devenga (al vender); solo una
 * obligación posterior REAL, documentada aquí, la difiere hasta cumplirse.
 * Ronda 4 (solo recibida): si el contrato pacta descontar la remuneración de lo
 * que se debe al dueño; sin pacto, la remuneración es una cuenta por cobrar.
 * Ronda 5 (solo recibida, C.Co. art. 1277): el orden de aplicación de lo recaudado y la liquidación por escrito.
 */
import { useTranslations } from 'next-intl';
import { TerminosLiquidacionCampos } from './TerminosLiquidacionCampos';
import { AvisoTonal, FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { validarCondiciones, type CondicionesContrato, type ErrorCondicion, type ParteContrato } from '@/lib/inventario/consignaciones/recibidas';

const NS = 'consignacionesR4.condiciones';

interface Props {
  valor: CondicionesContrato;
  onCambio: (c: CondicionesContrato) => void;
  tocado: boolean;
  /** Quién es «el dueño» en los textos: el consignante (recibida) o tú (entregada). */
  direccion: 'recibida' | 'entregada';
  /** Enlace a la factura de compra o de venta cuando eligen compra real. */
  rutaCompraReal: string;
}

function Opciones<V extends string>({
  id,
  etiqueta,
  valor,
  opciones,
  onCambio,
  error,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  valor: V | null;
  opciones: readonly { valor: V; etiqueta: string }[];
  onCambio: (v: V) => void;
  error?: string | null;
  ayuda?: string;
}) {
  const t = useTranslations(NS);
  return (
    <FormField etiqueta={etiqueta} obligatorio error={error} ayuda={ayuda}>
      {(c) => (
        <Select value={valor ?? ''} onValueChange={(v) => onCambio(v as V)}>
          <SelectTrigger id={c.id ?? id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
            <SelectValue placeholder={t('elegir')} />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function CondicionesContratoCampos({ valor, onCambio, tocado, direccion, rutaCompraReal }: Props) {
  const t = useTranslations(NS);
  const errores = new Set<ErrorCondicion>(tocado ? validarCondiciones(valor, direccion) : []);
  const err = (e: ErrorCondicion) => (errores.has(e) ? t(`errores.${e}`) : null);
  const partes: { valor: ParteContrato; etiqueta: string }[] = [
    { valor: 'dueno', etiqueta: t(direccion === 'recibida' ? 'parte.consignante' : 'parte.tu') },
    { valor: 'consignatario', etiqueta: t(direccion === 'recibida' ? 'parte.tu' : 'parte.consignatario') },
  ];
  const fijar = (p: Partial<CondicionesContrato>) => onCambio({ ...valor, ...p });
  const fijarRiesgo = (k: keyof CondicionesContrato['riesgos'], v: ParteContrato) => onCambio({ ...valor, riesgos: { ...valor.riesgos, [k]: v } });
  // En mandato la condición contable es la de agente: la impone la modalidad, no es un valor por defecto.
  const fijarContrato = (v: NonNullable<CondicionesContrato['contrato']>) =>
    fijar({ contrato: v, condicion: v === 'intermediacion' ? 'agente' : null });
  const facturaRem = valor.facturaRemuneracion === null ? null : valor.facturaRemuneracion ? 'si' : 'no';
  const compensacion = valor.compensacionRemuneracion === null ? null : valor.compensacionRemuneracion ? 'si' : 'no';

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-line p-3 sm:p-4">
      <legend className="px-1 text-sm font-medium text-fg">{t('titulo')}</legend>
      <Opciones
        id="consignacion-contrato"
        etiqueta={t('contrato')}
        valor={valor.contrato}
        onCambio={fijarContrato}
        error={err('contrato')}
        ayuda={valor.contrato ? t(`ayudaContrato.${valor.contrato}`) : t('ayudaSinContrato')}
        opciones={[
          { valor: 'intermediacion', etiqueta: t('contratos.intermediacion') },
          { valor: 'estimatorio', etiqueta: t('contratos.estimatorio') },
          { valor: 'compra', etiqueta: t('contratos.compra') },
        ]}
      />
      {valor.contrato === 'compra' && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('compraReal.titulo')}
          descripcion={t('compraReal.descripcion')}
          accion={{ etiqueta: t('compraReal.accion'), href: rutaCompraReal }}
        />
      )}
      {valor.contrato === 'estimatorio' && (
        <AvisoTonal tono="advertencia" titulo={t('estimatorioBloqueado.titulo')} descripcion={t('estimatorioBloqueado.descripcion')} />
      )}
      {valor.contrato === 'intermediacion' && (
        <>
          <dl className="grid grid-cols-1 gap-2 rounded-md bg-subtle p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-fg-muted">{t('condicion')}</dt>
              <dd className="text-fg">{t('condiciones.agente')}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('tributario')}</dt>
              <dd className="text-fg">{t('tributarios.mandato')}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {direccion === 'recibida' && (
              <Opciones
                id="consignacion-valoracion"
                etiqueta={t('valoracion')}
                valor={valor.valoracion}
                onCambio={(v) => fijar({ valoracion: v })}
                error={err('valoracion')}
                ayuda={t('valoracionAyuda')}
                opciones={[
                  { valor: 'costo_acreditado', etiqueta: t('valoraciones.costo_acreditado') },
                  { valor: 'valor_convenido', etiqueta: t('valoraciones.valor_convenido') },
                ]}
              />
            )}
            <Opciones
              id="consignacion-precio"
              etiqueta={t('precio')}
              valor={valor.precioModo}
              onCambio={(v) => fijar({ precioModo: v })}
              error={err('precio')}
              opciones={[
                { valor: 'fijo', etiqueta: t('precios.fijo') },
                { valor: 'minimo', etiqueta: t('precios.minimo') },
              ]}
            />
            <Opciones
              id="consignacion-remuneracion"
              etiqueta={t('remuneracion')}
              valor={valor.remuneracionModo}
              onCambio={(v) => fijar({ remuneracionModo: v })}
              error={err('remuneracion')}
              opciones={[
                { valor: 'porcentaje', etiqueta: t('remuneraciones.porcentaje') },
                { valor: 'precio_liquidacion', etiqueta: t('remuneraciones.precio_liquidacion') },
              ]}
            />
            {valor.remuneracionModo === 'porcentaje' && (
              <Opciones
                id="consignacion-base"
                etiqueta={t('base')}
                valor={valor.baseComision}
                onCambio={(v) => fijar({ baseComision: v })}
                error={err('base')}
                opciones={[
                  { valor: 'precio_pactado', etiqueta: t('bases.precio_pactado') },
                  { valor: 'precio_venta', etiqueta: t('bases.precio_venta') },
                ]}
              />
            )}
            <Opciones
              id="consignacion-reconocimiento"
              etiqueta={t('reconocimiento')}
              valor={valor.reconocimiento}
              onCambio={(v) => fijar({ reconocimiento: v })}
              error={err('reconocimiento')}
              ayuda={t('reconocimientoAyuda')}
              opciones={[
                { valor: 'al_vender', etiqueta: t('reconocimientos.al_vender') },
                { valor: 'obligacion_posterior', etiqueta: t('reconocimientos.obligacion_posterior') },
              ]}
            />
            {valor.reconocimiento === 'obligacion_posterior' && (
              <div className="sm:col-span-2">
                <FormField etiqueta={t('obligacionPosterior')} obligatorio ayuda={t('obligacionPosteriorAyuda')} error={err('obligacion_posterior')}>
                  {(c) => (
                    <Textarea
                      id={c.id}
                      aria-labelledby={c.idEtiqueta}
                      aria-invalid={c['aria-invalid']}
                      value={valor.obligacionPosterior ?? ''}
                      maxLength={1000}
                      rows={2}
                      placeholder={t('obligacionPosteriorPlaceholder')}
                      onChange={(e) => fijar({ obligacionPosterior: e.target.value })}
                    />
                  )}
                </FormField>
              </div>
            )}
            <Opciones
              id="consignacion-factura-remuneracion"
              etiqueta={t('facturaRemuneracion')}
              valor={facturaRem}
              onCambio={(v) => fijar({ facturaRemuneracion: v === 'si' })}
              error={err('factura_remuneracion')}
              ayuda={t('facturaRemuneracionAyuda')}
              opciones={[
                { valor: 'si', etiqueta: t('si') },
                { valor: 'no', etiqueta: t('no') },
              ]}
            />
            <Opciones
              id="consignacion-obligacion"
              etiqueta={t('obligacion')}
              valor={valor.obligacionDueno}
              onCambio={(v) => fijar({ obligacionDueno: v })}
              error={err('obligacion')}
              ayuda={t('obligacionAyuda')}
              opciones={[
                { valor: 'venta', etiqueta: t('obligaciones.venta') },
                { valor: 'cobro', etiqueta: t('obligaciones.cobro') },
              ]}
            />
            {direccion === 'recibida' && (
              <Opciones
                id="consignacion-compensacion-remuneracion"
                etiqueta={t('compensacionRemuneracion')}
                valor={compensacion}
                onCambio={(v) => fijar({ compensacionRemuneracion: v === 'si' })}
                error={err('compensacion_remuneracion')}
                ayuda={t('compensacionRemuneracionAyuda')}
                opciones={[
                  { valor: 'si', etiqueta: t('si') },
                  { valor: 'no', etiqueta: t('no') },
                ]}
              />
            )}
          </div>
          {direccion === 'recibida' && (
            <TerminosLiquidacionCampos
              idBase="consignacion"
              orden={valor.ordenAplicacion}
              liquidacion={valor.liquidacionEscrita}
              compensacion={valor.compensacionRemuneracion}
              onOrden={(o) => fijar({ ordenAplicacion: o })}
              onLiquidacion={(l) => fijar({ liquidacionEscrita: l })}
              tocado={tocado}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(['devoluciones', 'perdidas', 'gastos'] as const).map((k) => (
              <Opciones
                key={k}
                id={`consignacion-riesgo-${k}`}
                etiqueta={t(`riesgos.${k}`)}
                valor={valor.riesgos[k]}
                onCambio={(v) => fijarRiesgo(k, v)}
                error={k === 'devoluciones' ? err('riesgos') : null}
                opciones={partes}
              />
            ))}
          </div>
          <p className="text-xs text-fg-muted">{t('facturaMandatario')}</p>
          <p className="text-xs text-fg-muted">{t('impuestosPorLey')}</p>
        </>
      )}
    </fieldset>
  );
}

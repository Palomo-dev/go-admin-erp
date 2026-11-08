'use client';

/**
 * Condiciones del contrato de consignación — UNA pieza para recibir a mano (R4)
 * y para la nueva nota entregada. Criterio del Contador: la clasificación es
 * OBLIGATORIA y no tiene valor por defecto (intermediación, estimatorio o compra
 * real); si falta, el diálogo no deja operar. La compra real no es consignación:
 * se avisa y se ofrece la factura de compra. IVA y retenciones NO se eligen
 * aquí: se determinan por ley con los hechos de cada liquidación.
 */
import { useTranslations } from 'next-intl';
import { AvisoTonal, FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const errores = new Set<ErrorCondicion>(tocado ? validarCondiciones(valor) : []);
  const err = (e: ErrorCondicion) => (errores.has(e) ? t(`errores.${e}`) : null);
  const partes: { valor: ParteContrato; etiqueta: string }[] = [
    { valor: 'dueno', etiqueta: t(direccion === 'recibida' ? 'parte.consignante' : 'parte.tu') },
    { valor: 'consignatario', etiqueta: t(direccion === 'recibida' ? 'parte.tu' : 'parte.consignatario') },
  ];
  const fijar = (p: Partial<CondicionesContrato>) => onCambio({ ...valor, ...p });
  const fijarRiesgo = (k: keyof CondicionesContrato['riesgos'], v: ParteContrato) => onCambio({ ...valor, riesgos: { ...valor.riesgos, [k]: v } });

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-line p-3 sm:p-4">
      <legend className="px-1 text-sm font-medium text-fg">{t('titulo')}</legend>
      <Opciones
        id="consignacion-contrato"
        etiqueta={t('contrato')}
        valor={valor.contrato}
        onCambio={(v) => fijar({ contrato: v })}
        error={err('contrato')}
        ayuda={valor.contrato ? t(`ayudaContrato.${valor.contrato}`) : t('ayudaSinContrato')}
        opciones={[
          { valor: 'intermediacion', etiqueta: t('contratos.intermediacion') },
          { valor: 'estimatorio', etiqueta: t('contratos.estimatorio') },
          { valor: 'compra', etiqueta: t('contratos.compra') },
        ]}
      />
      {valor.contrato === 'compra' ? (
        <AvisoTonal
          tono="advertencia"
          titulo={t('compraReal.titulo')}
          descripcion={t('compraReal.descripcion')}
          accion={{ etiqueta: t('compraReal.accion'), href: rutaCompraReal }}
        />
      ) : (
        valor.contrato && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              {valor.contrato === 'intermediacion' && (
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
              )}
              {valor.contrato === 'estimatorio' && (
                <Opciones
                  id="consignacion-factura"
                  etiqueta={t('factura')}
                  valor={valor.factura}
                  onCambio={(v) => fijar({ factura: v })}
                  opciones={[
                    { valor: 'consignatario', etiqueta: t(direccion === 'recibida' ? 'parte.tu' : 'parte.consignatario') },
                    { valor: 'consignante', etiqueta: t(direccion === 'recibida' ? 'parte.consignante' : 'parte.tu') },
                  ]}
                />
              )}
            </div>
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
            {valor.contrato === 'intermediacion' && <p className="text-xs text-fg-muted">{t('facturaMandatario')}</p>}
            <p className="text-xs text-fg-muted">{t('impuestosPorLey')}</p>
          </>
        )
      )}
    </fieldset>
  );
}

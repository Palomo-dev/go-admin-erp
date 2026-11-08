'use client';

/**
 * «Datos fiscales de la línea»: clasificación de IVA (gravada, exenta, excluida,
 * no sujeta; tarifa; tipo de operación; fundamento) y, en compras y documento
 * soporte, la procedencia del IVA descontable (ET arts. 485, 488, 490, 496).
 * Parte de lo guardado o, si la línea no está clasificada, de la sugerencia del
 * producto, que la persona confirma. No cambia importes ni impuestos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField, FilaDato, ListaDatos } from '@/components/kit';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ESTADOS_DESCONTABLE,
  TIPOS_OPERACION_IVA,
  TRATAMIENTOS_IVA,
  clasificacionInicial,
  validarClasificacion,
  type EstadoDescontable,
  type LineaFiscal,
} from '@/lib/finanzas/tributario/formulario300';
import { clienteIva300 } from './clienteIva300';
import { codigoDe } from '../piezas';

const CLASE_CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20';
const CLASE_AREA =
  'w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20';

export function ClasificarLineaDialogo({
  linea,
  onCerrar,
  onGuardado,
}: {
  linea: LineaFiscal | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('finanzasIva300.clasificar');
  const te = useTranslations('finanzasIva300.errores');
  const { formatear } = useMonedaOrganizacion();

  const inicial = useMemo(() => (linea ? clasificacionInicial(linea) : null), [linea]);
  const [tratamiento, setTratamiento] = useState('');
  const [tarifa, setTarifa] = useState('');
  const [tipo, setTipo] = useState('');
  const [fundamento, setFundamento] = useState('');
  const [descontable, setDescontable] = useState<EstadoDescontable>('por_evaluar');
  const [porcentaje, setPorcentaje] = useState('');
  const [motivo, setMotivo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!linea || !inicial) return;
    setTratamiento(inicial.tratamiento ?? '');
    setTarifa(inicial.tarifa !== null ? String(inicial.tarifa) : '');
    setTipo(inicial.tipoOperacion ?? '');
    setFundamento(inicial.fundamento ?? '');
    setDescontable(linea.descontable?.estado ?? 'por_evaluar');
    setPorcentaje(linea.descontable?.porcentaje !== null && linea.descontable?.porcentaje !== undefined ? String(linea.descontable.porcentaje) : '');
    setMotivo(linea.descontable?.motivo ?? '');
    setPeriodo(linea.descontable?.periodo ?? '');
    setError(null);
  }, [linea, inicial]);

  const guardar = async () => {
    if (!linea) return;
    const cuerpo: Record<string, unknown> = {
      tratamiento,
      tarifa: tratamiento === 'gravada' ? tarifa : 0,
      tipo_operacion: tipo || null,
      fundamento,
    };
    if (linea.compra) {
      cuerpo.descontable = descontable;
      cuerpo.descontable_porcentaje = descontable === 'proporcional' ? porcentaje : null;
      cuerpo.descontable_motivo = motivo;
      cuerpo.descontable_periodo = periodo || null;
    }
    const v = validarClasificacion(cuerpo, { compra: linea.compra });
    if (!v.ok) {
      setError(te(v.error));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await clienteIva300.clasificar(linea.tabla, linea.id, v.datos);
      onGuardado();
    } catch (err) {
      const c = codigoDe(err);
      setError(te.has(c) ? te(c) : te('desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const sugerencia = linea?.sugerencia.tratamiento
    ? t('sugerencia', {
        tratamiento: t(`tratamientos.${linea.sugerencia.tratamiento}`),
        tarifa: linea.sugerencia.tarifa ?? 0,
        tipo: linea.sugerencia.tipoOperacion ? t(`tipos.${linea.sugerencia.tipoOperacion}`) : t('sinTipo'),
      })
    : t('sinSugerencia');

  return (
    <Dialogo
      abierto={linea !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={560}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      {linea && (
        <div className="space-y-4">
          <ListaDatos>
            <FilaDato etiqueta={t('linea')} valor={linea.descripcion || '—'} />
            <FilaDato etiqueta={t('baseIva')} valor={`${formatear(linea.base)} · ${formatear(linea.iva)}`} />
            <FilaDato etiqueta={t('sugerenciaEtiqueta')} valor={sugerencia} />
          </ListaDatos>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('tratamiento')} obligatorio>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={tratamiento}
                  vacio={t('elegir')}
                  onCambiar={(v) => {
                    setTratamiento(v);
                    if (v !== 'gravada') setTarifa('0');
                  }}
                  opciones={TRATAMIENTOS_IVA.map((x) => ({ valor: x, etiqueta: t(`tratamientos.${x}`) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('tarifa')} obligatorio={tratamiento === 'gravada'}>
              {(c) => (
                <input
                  id={c.id}
                  inputMode="decimal"
                  className={CLASE_CAMPO}
                  value={tratamiento === 'gravada' ? tarifa : '0'}
                  disabled={tratamiento !== 'gravada'}
                  onChange={(e) => setTarifa(e.target.value.replace(',', '.'))}
                  aria-describedby={c['aria-describedby']}
                />
              )}
            </FormField>
            <FormField etiqueta={t('tipo')} ayuda={t('tipoAyuda')}>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={tipo}
                  vacio={t('sinTipo')}
                  onCambiar={setTipo}
                  opciones={TIPOS_OPERACION_IVA.map((x) => ({ valor: x, etiqueta: t(`tipos.${x}`) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('fundamento')} ayuda={tratamiento === 'exenta' ? t('fundamentoExenta') : t('fundamentoAyuda')} className="sm:col-span-2">
              {(c) => (
                <textarea id={c.id} rows={2} className={CLASE_AREA} value={fundamento} maxLength={500} onChange={(e) => setFundamento(e.target.value)} />
              )}
            </FormField>
          </div>

          {linea.compra && (
            <fieldset className="space-y-4 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t('descontableTitulo')}</legend>
              <p className="text-xs text-fg-secondary">{t('descontableAyuda')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField etiqueta={t('descontable')}>
                  {(c) => (
                    <SelectNativo
                      id={c.id}
                      valor={descontable}
                      onCambiar={(v) => setDescontable(v as EstadoDescontable)}
                      opciones={ESTADOS_DESCONTABLE.map((x) => ({ valor: x, etiqueta: t(`descontables.${x}`) }))}
                    />
                  )}
                </FormField>
                {descontable === 'proporcional' && (
                  <FormField etiqueta={t('porcentaje')} obligatorio>
                    {(c) => (
                      <input id={c.id} inputMode="decimal" className={CLASE_CAMPO} value={porcentaje} onChange={(e) => setPorcentaje(e.target.value.replace(',', '.'))} />
                    )}
                  </FormField>
                )}
                {descontable !== 'por_evaluar' && (
                  <>
                    <FormField etiqueta={t('periodo')} ayuda={t('periodoAyuda')}>
                      {(c) => <input id={c.id} type="date" className={CLASE_CAMPO} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />}
                    </FormField>
                    <FormField etiqueta={t('motivo')} obligatorio className="sm:col-span-2">
                      {(c) => <textarea id={c.id} rows={2} className={CLASE_AREA} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />}
                    </FormField>
                  </>
                )}
              </div>
            </fieldset>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialogo>
  );
}

'use client';

/**
 * Borrador del IVA · formulario 300 (Figma «07 Finanzas» 2335:137440, captura
 * `docs/design/figma/88-tributario-iva-300.png`). Renglones calculados desde
 * los libros (cuentas 2408) por la función `fn_tributario_borrador_iva`; cada
 * renglón abre la lista de asientos de donde sale. Lo que no se puede repartir
 * con exactitud se ve «Revisar» con el valor de los libros, nunca como cero.
 *
 * Es un BORRADOR: no se presenta ni se firma ante la DIAN. Página de trabajo
 * (revisar renglón por renglón), así que vive en Finanzas › Tributario; el
 * informe de impuestos sigue en Reportes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Download, ListTree } from 'lucide-react';
import { DataTable, Dialogo, FormField, StatusBadge, clasesBoton, useParametrosUrl, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { esDiaValido, etiquetaPeriodo, mesAnterior, periodosRecientes, type Periodicidad } from '@/lib/finanzas/tributario/periodos';
import { filasCsvBorradorIva, saldoDefinitivo, type BorradorIva, type RenglonIva } from '@/lib/finanzas/tributario/borradorIva';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { EnlaceAsiento } from '@/components/finanzas/contabilidad/piezas';
import { tributarioCliente, RUTAS_TRIBUTARIO, type BorradorCliente } from '../tributarioCliente';
import { AvisoBorradores, AvisoPendienteActivar, CabeceraTributario, ErrorLectura, codigoDe, type Lectura } from '../piezas';
import { AvisoVigenciasPeriodo } from '../AvisoVigenciasPeriodo';
import { Formulario300Seccion } from './Formulario300Seccion';

type Fila =
  | { tipo: 'seccion'; id: string; etiqueta: string }
  | { tipo: 'renglon'; id: string; r: RenglonIva }
  | { tipo: 'total'; id: string; etiqueta: string; valor: number; revisar: boolean };

const PERIODICIDADES_IVA: Periodicidad[] = ['bimestral', 'cuatrimestral', 'anual'];

export function BorradorIvaPage() {
  const t = useTranslations('finanzasTributarioR4.iva');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const { leer, fijar } = useParametrosUrl();

  const periodicidad: Periodicidad = PERIODICIDADES_IVA.includes(leer('cada') as Periodicidad) ? (leer('cada') as Periodicidad) : 'bimestral';
  const opciones = useMemo(() => periodosRecientes(periodicidad, mesAnterior(hoy), 12), [periodicidad, hoy]);
  const desdeUrl = leer('desde');
  const hastaUrl = leer('hasta');
  const rangoUrl = esDiaValido(desdeUrl) && esDiaValido(hastaUrl) && hastaUrl >= desdeUrl ? { desde: desdeUrl, hasta: hastaUrl } : null;
  const periodo = rangoUrl ?? (opciones[0] ? { desde: opciones[0].desde, hasta: opciones[0].hasta } : null);

  const [lectura, setLectura] = useState<Lectura<BorradorCliente>>({ estado: 'cargando' });
  const [detalle, setDetalle] = useState<RenglonIva | null>(null);

  const cargar = useCallback(async () => {
    if (!periodo) return;
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await tributarioCliente.borradorIva(periodo.desde, periodo.hasta) });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo?.desde, periodo?.hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const borrador: BorradorIva | null = lectura.estado === 'listo' && lectura.datos.estado === 'listo' ? lectura.datos.borrador : null;
  const pendiente = lectura.estado === 'listo' && lectura.datos.estado === 'pendiente_activar';

  const etiquetaRenglon = useCallback(
    (r: RenglonIva) => {
      if (r.clave === 'gravadas') return t(r.lado === 'descontable' ? 'renglones.comprasGravadas' : 'renglones.ventasGravadas', { tarifa: new Intl.NumberFormat(locale).format(r.tarifa ?? 0) });
      const lado = r.lado === 'descontable' ? 'compras' : 'ventas';
      switch (r.clave) {
        case 'sin_iva':
          return t(`renglones.${lado}SinIva`);
        case 'devoluciones':
          return t('renglones.devoluciones');
        case 'tarifa_sin_identificar':
          return t(`renglones.${lado}SinTarifa`);
        case 'no_cuadra':
          return t(`renglones.${lado}NoCuadra`);
        case 'sin_lineas':
          return t(`renglones.${lado}SinLineas`);
        case 'ajuste_redondeo':
          return t('renglones.redondeo');
        default:
          return t('renglones.otros');
      }
    },
    [t, locale],
  );

  const filas = useMemo<Fila[]>(() => {
    if (!borrador) return [];
    const out: Fila[] = [];
    const generado = borrador.renglones.filter((r) => r.lado === 'generado');
    const descontable = borrador.renglones.filter((r) => r.lado === 'descontable');
    const otros = borrador.renglones.filter((r) => r.lado === 'otros');
    const revisa = (rs: RenglonIva[]) => rs.some((r) => r.estado === 'revisar');
    out.push({ tipo: 'seccion', id: 's-generado', etiqueta: t('secciones.generado') });
    generado.forEach((r, i) => out.push({ tipo: 'renglon', id: `g-${i}`, r }));
    out.push({ tipo: 'total', id: 't-generado', etiqueta: t('totales.generado'), valor: borrador.ivaGenerado, revisar: revisa(generado) });
    out.push({ tipo: 'seccion', id: 's-descontable', etiqueta: t('secciones.descontable') });
    descontable.forEach((r, i) => out.push({ tipo: 'renglon', id: `d-${i}`, r }));
    out.push({ tipo: 'total', id: 't-descontable', etiqueta: t('totales.descontable'), valor: borrador.ivaDescontable, revisar: revisa(descontable) });
    if (otros.length > 0) {
      out.push({ tipo: 'seccion', id: 's-otros', etiqueta: t('secciones.otros') });
      otros.forEach((r, i) => out.push({ tipo: 'renglon', id: `o-${i}`, r }));
    }
    out.push({
      tipo: 'total',
      id: 't-saldo',
      etiqueta: borrador.saldo >= 0 ? t('totales.saldoPagar') : t('totales.saldoFavor'),
      valor: Math.abs(borrador.saldo),
      revisar: !saldoDefinitivo(borrador),
    });
    return out;
  }, [borrador, t]);

  const importe = (n: number | null) => (n === null ? '—' : n < 0 ? `(${formatear(Math.abs(n))})` : formatear(n));

  const columnas: ColumnaTabla<Fila>[] = [
    {
      id: 'concepto',
      encabezado: t('columnas.concepto'),
      celda: (f) =>
        f.tipo === 'seccion' ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">{f.etiqueta}</span>
        ) : f.tipo === 'total' ? (
          <span className="font-semibold text-fg">{f.etiqueta}</span>
        ) : (
          <span className="text-fg">{etiquetaRenglon(f.r)}</span>
        ),
    },
    {
      id: 'base',
      encabezado: t('columnas.base'),
      variante: 'importe',
      alinear: 'derecha',
      ocultarDebajo: 'sm',
      celda: (f) => (f.tipo === 'renglon' ? importe(f.r.base) : null),
    },
    {
      id: 'valor',
      encabezado: t('columnas.valor'),
      variante: 'importe',
      alinear: 'derecha',
      celda: (f) =>
        f.tipo === 'renglon' ? (
          importe(f.r.clave === 'sin_iva' ? null : f.r.valor)
        ) : f.tipo === 'total' ? (
          <span className="font-semibold text-fg">{formatear(f.valor)}</span>
        ) : null,
    },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (f) =>
        (f.tipo === 'renglon' && f.r.estado === 'revisar') || (f.tipo === 'total' && f.revisar) ? (
          <StatusBadge estado="revisar" etiqueta={tc('estados.revisar')} tono="advertencia" />
        ) : null,
    },
    {
      id: 'origen',
      encabezado: t('columnas.origen'),
      alinear: 'derecha',
      celda: (f) =>
        f.tipo === 'renglon' && f.r.totalAsientos > 0 ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline" onClick={() => setDetalle(f.r)}>
            <ListTree aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('verAsientos', { n: f.r.totalAsientos })}
          </button>
        ) : null,
    },
  ];

  const exportar = () => {
    if (!borrador || !periodo) return;
    const filasCsv = filasCsvBorradorIva(borrador, {
      encabezado: [t('columnas.concepto'), t('columnas.base'), t('columnas.valor'), t('columnas.estado'), t('columnas.asientos')],
      etiqueta: etiquetaRenglon,
      estado: (e) => (e === 'revisar' ? tc('estados.revisar') : tc('estados.ok')),
      generado: t('totales.generado'),
      descontable: t('totales.descontable'),
      saldo: borrador.saldo >= 0 ? t('totales.saldoPagar') : t('totales.saldoFavor'),
    });
    descargarCsv(`borrador-iva-${periodo.desde}-${periodo.hasta}.csv`, aCsv(filasCsv));
  };

  const etiqueta = periodo ? etiquetaPeriodo(periodo, locale) : '';
  const cuentas = borrador?.cuentas.length ? borrador.cuentas.join(', ') : '2408';

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <CabeceraTributario
        titulo={t('titulo')}
        subtitulo={periodo ? t('subtitulo', { periodo: etiqueta, cuentas }) : undefined}
        acciones={
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar} disabled={!borrador}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tc('excel')}
          </button>
        }
      />

      <AvisoBorradores />
      {periodo && <AvisoVigenciasPeriodo desde={periodo.desde} hasta={periodo.hasta} />}

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('periodicidad')}>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={periodicidad}
              onCambiar={(v) => fijar({ cada: v === 'bimestral' ? null : v, desde: null, hasta: null })}
              opciones={PERIODICIDADES_IVA.map((p) => ({ valor: p, etiqueta: t(`periodicidades.${p}`) }))}
            />
          )}
        </FormField>
        <FormField etiqueta={t('periodo')}>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={periodo ? `${periodo.desde}|${periodo.hasta}` : ''}
              onCambiar={(v) => {
                const [desde, hasta] = v.split('|');
                fijar({ desde, hasta });
              }}
              opciones={[
                ...(rangoUrl && !opciones.some((o) => o.desde === rangoUrl.desde && o.hasta === rangoUrl.hasta)
                  ? [{ valor: `${rangoUrl.desde}|${rangoUrl.hasta}`, etiqueta: etiquetaPeriodo(rangoUrl, locale) }]
                  : []),
                ...opciones.map((o) => ({ valor: `${o.desde}|${o.hasta}`, etiqueta: etiquetaPeriodo(o, locale) })),
              ]}
            />
          )}
        </FormField>
      </div>

      {/* Formulario 300 por casillas (v2, 20261108151000). Debajo sigue la vista por tarifa desde los libros (v1). */}
      {periodo && <Formulario300Seccion desde={periodo.desde} hasta={periodo.hasta} />}

      {lectura.estado === 'error' && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}
      {pendiente && <AvisoPendienteActivar descripcion={t('pendiente')} />}

      {lectura.estado !== 'error' && !pendiente && (
        <DataTable<Fila>
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(f) => f.id}
          estado={lectura.estado === 'cargando' ? 'cargando' : borrador && borrador.documentos === 0 && borrador.renglones.length === 0 ? 'vacio' : 'listo'}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
          tarjetaMovil={(f) =>
            f.tipo === 'seccion' ? (
              <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">{f.etiqueta}</p>
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="min-w-0">
                  <p className={f.tipo === 'total' ? 'font-semibold text-fg' : 'text-fg'}>{f.tipo === 'total' ? f.etiqueta : etiquetaRenglon(f.r)}</p>
                  {f.tipo === 'renglon' && f.r.base !== null && <p className="text-xs text-fg-secondary">{t('columnas.base')}: {importe(f.r.base)}</p>}
                  {f.tipo === 'renglon' && f.r.totalAsientos > 0 && (
                    <button type="button" className="mt-1 text-sm font-medium text-brand hover:underline" onClick={() => setDetalle(f.r)}>
                      {t('verAsientos', { n: f.r.totalAsientos })}
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 tabular-nums">
                  <span className={f.tipo === 'total' ? 'font-semibold text-fg' : 'text-fg'}>
                    {f.tipo === 'total' ? formatear(f.valor) : importe(f.r.clave === 'sin_iva' ? null : f.r.valor)}
                  </span>
                  {((f.tipo === 'renglon' && f.r.estado === 'revisar') || (f.tipo === 'total' && f.revisar)) && (
                    <StatusBadge estado="revisar" etiqueta={tc('estados.revisar')} tono="advertencia" />
                  )}
                </div>
              </div>
            )
          }
        />
      )}

      {borrador && (
        <p className="text-sm text-fg-secondary">
          {t('nota')}{' '}
          <Link href={RUTAS_TRIBUTARIO.reporteImpuestos} className="font-medium text-brand hover:underline">
            {t('informe')}
          </Link>
        </p>
      )}

      <Dialogo
        abierto={detalle !== null}
        onAbiertoChange={(a) => !a && setDetalle(null)}
        titulo={detalle ? etiquetaRenglon(detalle) : ''}
        descripcion={detalle ? t(`explicaciones.${detalle.clave}`) : undefined}
        ancho={520}
        primario={{ etiqueta: tc('cerrar'), onClick: () => setDetalle(null) }}
      >
        {detalle && (
          <div className="space-y-3">
            <p className="text-sm text-fg-secondary">{t('asientos.resumen', { asientos: detalle.totalAsientos, documentos: detalle.totalDocumentos })}</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {detalle.asientos.map((id) => (
                <li key={id}>
                  <EnlaceAsiento id={id} />
                </li>
              ))}
            </ul>
            {detalle.totalAsientos > detalle.asientos.length && (
              <p className="text-xs text-fg-secondary">{t('asientos.mas', { n: detalle.totalAsientos - detalle.asientos.length })}</p>
            )}
          </div>
        )}
      </Dialogo>
    </div>
  );
}

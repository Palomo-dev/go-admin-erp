'use client';

/**
 * Borrador del formulario 300 por casillas oficiales (rondas 1, 2 y 3 del Contador).
 * Cada casilla con su base, su IVA, el valor del formulario a miles y el enlace
 * a las líneas de origen; «Pendientes de clasificar» con su valor (nunca se
 * omiten); otros movimientos de la 2408 por su naturaleza REGISTRADA con soporte
 * (las señales solo sugieren); casillas «por diligenciar».
 *
 * Banda fija: «Borrador conciliado con libros — no es una declaración ni está
 * aprobado fiscalmente». El sistema nunca lo aprueba.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Download, ListTree } from 'lucide-react';
import { AvisoTonal, DataTable, Dialogo, FormField, StatusBadge, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { EnlaceAsiento } from '@/components/finanzas/contabilidad/piezas';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import {
  FILAS_300,
  NATURALEZAS_MOVIMIENTO,
  RESOLUCIONES_DOC_ELECTRONICO,
  SOPORTES_MOVIMIENTO,
  casilla,
  filasCsvFormulario300,
  rutaOrigen,
  tipoDocumentoLineas,
  totalPendientes,
  validarNaturaleza,
  type Formulario300,
  type LineaFiscal,
  type NaturalezaMovimiento,
  type Origen300,
  type OtroMovimiento300,
} from '@/lib/finanzas/tributario/formulario300';
import { clienteIva300, type Formulario300Cliente } from './clienteIva300';
import { ClasificarLineaDialogo } from './ClasificarLineaDialogo';
import { AvisoPendienteActivar, ErrorLectura, codigoDe, type Lectura } from '../piezas';

const CLASE_CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20';

type FilaCasilla = {
  id: string;
  concepto: string;
  base: number;
  iva: number | null;
  casillaBase: number;
  casillaIva: number | null;
  formularioBase: number;
  formularioIva: number | null;
  origenes: Origen300[];
  total: number;
};

export function Formulario300Seccion({ desde, hasta }: { desde: string; hasta: string }) {
  const t = useTranslations('finanzasIva300');
  const { formatear } = useMonedaOrganizacion();
  const [lectura, setLectura] = useState<Lectura<Formulario300Cliente>>({ estado: 'cargando' });
  const [origenes, setOrigenes] = useState<{ titulo: string; lista: Origen300[]; total: number } | null>(null);
  const [linea, setLinea] = useState<LineaFiscal | null>(null);
  const [movimiento, setMovimiento] = useState<OtroMovimiento300 | null>(null);
  const [declarar, setDeclarar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await clienteIva300.formulario(desde, hasta) });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const datos = lectura.estado === 'listo' ? lectura.datos : null;
  const f: Formulario300 | null = datos?.estado === 'listo' ? datos.formulario : null;
  const importe = (n: number | null) => (n === null ? '—' : n < 0 ? `(${formatear(Math.abs(n))})` : formatear(n));

  const filas = useMemo<FilaCasilla[]>(() => {
    if (!f) return [];
    return FILAS_300.map((p) => {
      const b = casilla(f, p.base);
      const i = p.iva ? casilla(f, p.iva) : undefined;
      // Origen: el de la casilla de IVA si la hay; si no, el de la base (casillas sin IVA, B1).
      const fuente = i && i.totalOrigenes > 0 ? i : b;
      return {
        id: `${p.base}-${p.iva ?? 'x'}`,
        concepto: p.concepto,
        base: b?.valor ?? 0,
        iva: p.iva ? (i?.valor ?? 0) : null,
        casillaBase: p.base,
        casillaIva: p.iva,
        formularioBase: b?.valorFormulario ?? 0,
        formularioIva: p.iva ? (i?.valorFormulario ?? 0) : null,
        origenes: fuente?.origenes ?? [],
        total: fuente?.totalOrigenes ?? 0,
      };
    });
  }, [f]);

  const abrirLinea = async (o: Origen300) => {
    const tipo = tipoDocumentoLineas(o.clase);
    if (!tipo || !o.lineaId) return;
    try {
      const r = await clienteIva300.lineas(tipo, o.documentoId);
      const l = r.estado === 'listo' ? r.lineas.find((x) => x.id === o.lineaId) : undefined;
      if (l) setLinea(l);
    } catch (err) {
      setAviso(t.has(`errores.${codigoDe(err)}`) ? t(`errores.${codigoDe(err)}`) : t('errores.desconocido'));
    }
  };

  const exportar = () => {
    if (!f) return;
    const filasCsv = filasCsvFormulario300(f, {
      encabezado: [t('columnas.casilla'), t('columnas.concepto'), t('columnas.valor'), t('columnas.formulario'), t('columnas.diferencia'), t('columnas.origenes')],
      concepto: (c) => `${t(`conceptos.${c.concepto}`)} · ${t(c.tipo === 'base' ? 'columnas.base' : 'columnas.iva')}`,
      pendiente: (p) => `${t('pendientes.titulo')} · ${t(`motivos.${p.motivo}`)}`,
      otro: (o) => `${t('otros.titulo')} · ${t(`naturalezas.${o.naturaleza}`)} · ${o.asiento}`,
    });
    descargarCsv(`formulario-300-${desde}-${hasta}.csv`, aCsv(filasCsv));
  };

  const verOrigen = (r: FilaCasilla) => setOrigenes({ titulo: t(`conceptos.${r.concepto}`), lista: r.origenes, total: r.total });

  const columnas: ColumnaTabla<FilaCasilla>[] = [
    { id: 'concepto', encabezado: t('columnas.concepto'), celda: (r) => <span className="text-fg">{t(`conceptos.${r.concepto}`)}</span> },
    { id: 'cbase', encabezado: t('columnas.casillaBase'), alinear: 'derecha', ocultarDebajo: 'sm', celda: (r) => <span className="tabular-nums text-fg-secondary">{r.casillaBase}</span> },
    { id: 'base', encabezado: t('columnas.base'), variante: 'importe', alinear: 'derecha', celda: (r) => importe(r.base) },
    { id: 'civa', encabezado: t('columnas.casillaIva'), alinear: 'derecha', ocultarDebajo: 'sm', celda: (r) => <span className="tabular-nums text-fg-secondary">{r.casillaIva ?? '—'}</span> },
    { id: 'iva', encabezado: t('columnas.iva'), variante: 'importe', alinear: 'derecha', celda: (r) => importe(r.iva) },
    {
      id: 'formulario',
      encabezado: t('columnas.formulario'),
      variante: 'importe',
      alinear: 'derecha',
      ocultarDebajo: 'md',
      celda: (r) => (
        <span className="tabular-nums">
          {importe(r.formularioBase)} · {importe(r.formularioIva)}
        </span>
      ),
    },
    {
      id: 'origen',
      encabezado: t('columnas.origenes'),
      alinear: 'derecha',
      celda: (r) =>
        r.total > 0 ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline" onClick={() => verOrigen(r)}>
            <ListTree aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('verOrigen', { n: r.total })}
          </button>
        ) : null,
    },
  ];

  const pendientesOtros = f?.otrosMovimientos.filter((o) => o.destino === 'pendiente') ?? [];
  const resueltos = f?.otrosMovimientos.filter((o) => o.destino !== 'pendiente') ?? [];
  const tp = f ? totalPendientes(f) : null;
  const hayAlertas =
    f &&
    (f.alertas.documentosEntrePeriodos > 0 ||
      f.alertas.notasDebitoOtroPeriodo > 0 ||
      f.alertas.comprasCausadasAntes > 0 ||
      f.alertas.grabadosDespuesDeDeclarar.length > 0 ||
      f.alertas.correccionesDeclaracionAnterior.length > 0);
  const etiquetaOtro = (o: OtroMovimiento300) =>
    o.sugerida ? t('otros.sugerido', { naturaleza: t(`naturalezas.${o.sugerida}`) }) : t(`naturalezas.${o.naturaleza}`);

  return (
    <section aria-labelledby="titulo-300" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-300" className="text-base font-semibold text-fg">
          {t('titulo')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {datos?.puedeAprobar && f && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setDeclarar(true)}>
              {f.periodoDeclarado ? t('declarado.editar') : t('declarado.registrar')}
            </button>
          )}
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={exportar} disabled={!f}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('excel')}
          </button>
        </div>
      </div>

      {lectura.estado === 'error' && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}
      {datos?.estado === 'pendiente_activar' && <AvisoPendienteActivar descripcion={t('pendienteActivar')} />}
      {lectura.estado === 'cargando' && <p className="text-sm text-fg-secondary">{t('cargando')}</p>}

      {f && (
        <>
          {f.estado === 'conciliado' ? (
            <AvisoTonal tono="advertencia" titulo={t('banda.conciliado')} descripcion={t('banda.descripcion')} />
          ) : (
            <AvisoTonal tono="peligro" rol="alert" titulo={t('banda.noConciliado')} descripcion={t('banda.diferencia', { valor: importe(f.conciliacion.diferencia) })} />
          )}
          {f.periodoDeclarado && (
            <AvisoTonal
              tono="informacion"
              titulo={t('declarado.titulo')}
              descripcion={t('declarado.descripcion', { numero: f.periodoDeclarado.numeroFormulario ?? '—', fecha: f.periodoDeclarado.presentadaEn })}
            />
          )}
          {hayAlertas && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('alertas.titulo')}
              descripcion={
                <ul className="list-disc space-y-1 pl-5">
                  {f.alertas.documentosEntrePeriodos > 0 && <li>{t('alertas.entrePeriodos', { n: f.alertas.documentosEntrePeriodos })}</li>}
                  {f.alertas.notasDebitoOtroPeriodo > 0 && <li>{t('alertas.notasDebito', { n: f.alertas.notasDebitoOtroPeriodo })}</li>}
                  {f.alertas.comprasCausadasAntes > 0 && <li>{t('alertas.causadasAntes', { n: f.alertas.comprasCausadasAntes })}</li>}
                  {f.alertas.grabadosDespuesDeDeclarar.length > 0 && (
                    <li>
                      {t('alertas.grabadosDespues', { n: f.alertas.grabadosDespuesDeDeclarar.length })}{' '}
                      {f.alertas.grabadosDespuesDeDeclarar.slice(0, 10).map((a) => (
                        <EnlaceAsiento key={a.asiento} id={a.asiento} className="mr-2" />
                      ))}
                    </li>
                  )}
                  {f.alertas.correccionesDeclaracionAnterior.length > 0 && (
                    <li>
                      {t('alertas.correccionesDeclaracion', { n: f.alertas.correccionesDeclaracionAnterior.length })}{' '}
                      {f.alertas.correccionesDeclaracionAnterior.slice(0, 10).map((a) => (
                        <EnlaceAsiento key={a.asiento} id={a.asiento} className="mr-2" />
                      ))}
                    </li>
                  )}
                </ul>
              }
            />
          )}

          <DataTable<FilaCasilla>
            etiqueta={t('titulo')}
            columnas={columnas}
            filas={filas}
            obtenerId={(r) => r.id}
            estado="listo"
            tarjetaMovil={(r) => (
              <div className="space-y-1 rounded-lg border border-line bg-surface p-3">
                <p className="font-medium text-fg">{t(`conceptos.${r.concepto}`)}</p>
                <p className="flex justify-between text-sm tabular-nums">
                  <span className="text-fg-secondary">{t('casillaN', { n: r.casillaBase })}</span>
                  <span>{importe(r.base)}</span>
                </p>
                {r.casillaIva !== null && (
                  <p className="flex justify-between text-sm tabular-nums">
                    <span className="text-fg-secondary">{t('casillaN', { n: r.casillaIva })}</span>
                    <span>{importe(r.iva)}</span>
                  </p>
                )}
                <p className="text-xs text-fg-secondary">{t('formularioMiles', { base: importe(r.formularioBase), iva: importe(r.formularioIva) })}</p>
                {r.total > 0 && (
                  <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => verOrigen(r)}>
                    {t('verOrigen', { n: r.total })}
                  </button>
                )}
              </div>
            )}
          />

          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
            <Cifra etiqueta={t('resumen.generado')} valor={importe(f.resumen.ivaGenerado)} formulario={t('resumen.formulario', { valor: importe(f.resumen.ivaGeneradoFormulario) })} />
            <Cifra etiqueta={t('resumen.descontable')} valor={importe(f.resumen.ivaDescontable)} formulario={t('resumen.formulario', { valor: importe(f.resumen.ivaDescontableFormulario) })} />
            <Cifra
              etiqueta={t('resumen.diferencia')}
              valor={importe(f.resumen.diferenciaPreliminar)}
              formulario={t('resumen.formulario', { valor: importe(f.resumen.diferenciaPreliminarFormulario) })}
            />
            <p className="text-xs text-fg-secondary sm:col-span-3">{t('resumen.nota')}</p>
            {f.resumen.ivaNoDescontableAlCosto > 0 && (
              <p className="text-xs text-fg-secondary sm:col-span-3">{t('resumen.alCosto', { valor: importe(f.resumen.ivaNoDescontableAlCosto) })}</p>
            )}
          </div>

          <section aria-labelledby="pendientes-300" className="space-y-2">
            <h3 id="pendientes-300" className="flex items-center gap-2 text-sm font-semibold text-fg">
              {t('pendientes.titulo')} {tp && tp.origenes > 0 && <StatusBadge estado="revisar" etiqueta={String(tp.origenes)} tono="advertencia" />}
            </h3>
            {tp && tp.origenes === 0 ? (
              <p className="text-sm text-fg-secondary">{t('pendientes.ninguno')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {f.pendientes.map((p) => (
                  <li key={`${p.lado}-${p.motivo}`} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{t(`motivos.${p.motivo}`)}</p>
                      <p className="text-xs text-fg-secondary">
                        {t(`lados.${p.lado}`)} · {t('baseIva', { base: importe(p.base), iva: importe(p.iva) })}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="self-start text-sm font-medium text-brand hover:underline sm:self-auto"
                      onClick={() => setOrigenes({ titulo: t(`motivos.${p.motivo}`), lista: p.origenes, total: p.totalOrigenes })}
                    >
                      {t('verOrigen', { n: p.totalOrigenes })}
                    </button>
                  </li>
                ))}
                {pendientesOtros.map((o) => (
                  <li key={`m-${o.asiento}`} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{t(`motivos.${o.motivo ?? 'sin_soporte'}`)}</p>
                      <p className="text-xs text-fg-secondary">
                        <EnlaceAsiento id={o.asiento} /> · {o.fecha ?? '—'} · {importe(o.valor)} · {etiquetaOtro(o)}
                      </p>
                      {o.correccion && !o.correccion.completa && <p className="text-xs text-warning-text">{t('otros.correccionIncompleta')}</p>}
                    </div>
                    {datos?.puedeAprobar && (
                      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setMovimiento(o)}>
                        {t('otros.registrar')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {resueltos.length > 0 && (
            <section aria-labelledby="otros-300" className="space-y-2">
              <h3 id="otros-300" className="text-sm font-semibold text-fg">
                {t('otros.titulo')}
              </h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {resueltos.map((o) => (
                  <li key={o.asiento} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-fg">
                        {t(`naturalezas.${o.naturaleza}`)} · {t(`destinos.${o.destino}`)}
                      </p>
                      <p className="text-xs text-fg-secondary">
                        <EnlaceAsiento id={o.asiento} /> · {o.fecha ?? '—'} · {importe(o.valor)}
                        {o.soporte ? ` · ${o.soporte}` : ''}
                      </p>
                    </div>
                    {datos?.puedeAprobar && o.naturaleza !== 'cierre' && (
                      <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setMovimiento(o)}>
                        {t('otros.cambiar')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="diligenciar-300" className="space-y-2">
            <h3 id="diligenciar-300" className="text-sm font-semibold text-fg">
              {t('diligenciar.titulo')}
            </h3>
            <p className="text-xs text-fg-secondary">{t('diligenciar.ayuda')}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {f.porDiligenciar.map((p) => (
                <li key={p.clave} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span className="text-fg">{t(`diligenciar.${p.clave}`)}</span>
                  <span className="tabular-nums text-fg-secondary">{p.valor === null ? t('diligenciar.porDiligenciar') : importe(p.valor)}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-fg-secondary">
            {t('conciliacion', {
              libro: importe(f.conciliacion.libro2408),
              casillas: importe(f.conciliacion.casillas),
              pendientes: importe(f.conciliacion.pendientes),
              otros: importe(f.conciliacion.otros),
              redondeo: importe(f.conciliacion.redondeoLineas),
              diferencia: importe(f.conciliacion.diferencia),
            })}
          </p>
        </>
      )}

      {aviso && (
        <p role="alert" className="text-sm text-danger-text">
          {aviso}
        </p>
      )}

      <Dialogo abierto={origenes !== null} onAbiertoChange={(a) => !a && setOrigenes(null)} titulo={origenes?.titulo ?? ''} ancho={672} primario={{ etiqueta: t('cerrar'), onClick: () => setOrigenes(null) }}>
        {origenes && (
          <div className="space-y-2">
            <ul className="divide-y divide-line">
              {origenes.lista.map((o, i) => {
                const ruta = rutaOrigen(o);
                return (
                  <li key={`${o.documentoId}-${o.lineaId ?? i}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm text-fg">
                        {t(`clases.${o.clase}`)}{' '}
                        {ruta ? (
                          <Link href={ruta} className="font-medium text-brand hover:underline">
                            {o.numero ?? o.documentoId.slice(0, 8)}
                          </Link>
                        ) : (
                          (o.numero ?? '')
                        )}
                        {o.asiento !== null && (
                          <>
                            {' · '}
                            <EnlaceAsiento id={o.asiento} />
                          </>
                        )}
                      </p>
                      <p className="text-xs tabular-nums text-fg-secondary">
                        {t('fechas', { contabilizacion: o.fecha ?? '—', documento: o.fechaDocumento ?? '—' })} · {t('baseIva', { base: importe(o.base), iva: importe(o.iva) })}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {o.entrePeriodos && <StatusBadge estado="entre" etiqueta={t('banderas.entrePeriodos', { factura: o.facturaOrigen?.numero ?? '—' })} tono="informacion" />}
                        {o.corrigeOtroPeriodo && <StatusBadge estado="nd" etiqueta={t('banderas.corrigeOtroPeriodo', { factura: o.facturaOrigen?.numero ?? '—' })} tono="advertencia" />}
                        {o.causadoPeriodoAnterior && <StatusBadge estado="causado" etiqueta={t('banderas.causadoAntes')} tono="advertencia" />}
                        {o.posteriorDeclaracion && <StatusBadge estado="posterior" etiqueta={t('banderas.posterior')} tono="advertencia" />}
                      </div>
                    </div>
                    {datos?.puedeClasificar && o.lineaId && (
                      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void abrirLinea(o)}>
                        {t('clasificarLinea')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {origenes.total > origenes.lista.length && <p className="text-xs text-fg-secondary">{t('masOrigenes', { n: origenes.total - origenes.lista.length })}</p>}
          </div>
        )}
      </Dialogo>

      <ClasificarLineaDialogo
        linea={linea}
        onCerrar={() => setLinea(null)}
        onGuardado={() => {
          setLinea(null);
          setOrigenes(null);
          void cargar();
        }}
      />

      <NaturalezaDialogo
        movimiento={movimiento}
        onCerrar={() => setMovimiento(null)}
        onGuardado={() => {
          setMovimiento(null);
          void cargar();
        }}
      />

      {f && (
        <DeclaracionDialogo
          abierto={declarar}
          desde={desde}
          hasta={hasta}
          actual={f.periodoDeclarado}
          onCerrar={() => setDeclarar(false)}
          onGuardado={() => {
            setDeclarar(false);
            void cargar();
          }}
        />
      )}
    </section>
  );
}

function Cifra({ etiqueta, valor, formulario }: { etiqueta: string; valor: string; formulario: string }) {
  return (
    <div>
      <p className="text-xs text-fg-secondary">{etiqueta}</p>
      <p className="text-lg font-semibold tabular-nums text-fg">{valor}</p>
      <p className="text-xs tabular-nums text-fg-secondary">{formulario}</p>
    </div>
  );
}

type LineaDevuelta = { id: string; descripcion: string; elegida: boolean; base: string; iva: string };

/**
 * Naturaleza de un movimiento de la 2408, con su soporte (ronda 2). La devolución
 * de compra exige la factura, las líneas devueltas con su base e IVA y el soporte
 * (nota crédito del proveedor o nota de ajuste del documento soporte) — B4.
 * La corrección de error (ronda 3) pide además el documento electrónico resuelto
 * y si corresponde corregir una declaración anterior; se puede guardar a medias.
 */
function NaturalezaDialogo({ movimiento, onCerrar, onGuardado }: { movimiento: OtroMovimiento300 | null; onCerrar: () => void; onGuardado: () => void }) {
  const t = useTranslations('finanzasIva300');
  const { formatear } = useMonedaOrganizacion();
  const [naturaleza, setNaturaleza] = useState<NaturalezaMovimiento | ''>('');
  const [soporteTipo, setSoporteTipo] = useState('');
  const [soporte, setSoporte] = useState('');
  const [soporteFecha, setSoporteFecha] = useState('');
  const [factura, setFactura] = useState('');
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaDevuelta[]>([]);
  const [resolucion, setResolucion] = useState('');
  const [resolucionRef, setResolucionRef] = useState('');
  const [resolucionFecha, setResolucionFecha] = useState('');
  const [corrige, setCorrige] = useState<'' | 'si' | 'no'>('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movimiento) return;
    const declarada = movimiento.declarada && NATURALEZAS_MOVIMIENTO.includes(movimiento.naturaleza as NaturalezaMovimiento);
    setNaturaleza(declarada ? (movimiento.naturaleza as NaturalezaMovimiento) : (movimiento.sugerida ?? ''));
    setSoporteTipo(movimiento.soporteTipo ?? '');
    setSoporte(movimiento.soporte ?? '');
    setSoporteFecha(movimiento.soporteFecha ?? '');
    setFactura('');
    setFacturaId(movimiento.facturaCompra);
    setLineas([]);
    setResolucion(movimiento.correccion?.resolucion ?? '');
    setResolucionRef(movimiento.correccion?.referencia ?? '');
    setResolucionFecha(movimiento.correccion?.fecha ?? '');
    const c = movimiento.correccion?.corrigeDeclaracionAnterior;
    setCorrige(c === true ? 'si' : c === false ? 'no' : '');
    setError(null);
  }, [movimiento]);

  const buscarFactura = async () => {
    setError(null);
    // La factura de compra se busca por su número con la sesión (RLS: solo las de la organización).
    const { data } = await supabase
      .from('invoice_purchase')
      .select('id')
      .eq('organization_id', getOrganizationId())
      .eq('number_ext', factura.trim())
      .limit(1)
      .maybeSingle();
    const id = (data as { id?: string } | null)?.id ?? null;
    if (!id) {
      setError(t('errores.factura_no_encontrada'));
      return;
    }
    setFacturaId(id);
    try {
      const r = await clienteIva300.lineas('factura_compra', id);
      setLineas(r.estado === 'listo' ? r.lineas.map((l) => ({ id: l.id, descripcion: l.descripcion, elegida: false, base: String(l.base), iva: String(l.iva) })) : []);
    } catch (err) {
      setError(t.has(`errores.${codigoDe(err)}`) ? t(`errores.${codigoDe(err)}`) : t('errores.desconocido'));
    }
  };

  const elegidas = lineas.filter((l) => l.elegida);
  const sumaBase = elegidas.reduce((s, l) => s + (Number(l.base.replace(',', '.')) || 0), 0);
  const sumaIva = elegidas.reduce((s, l) => s + (Number(l.iva.replace(',', '.')) || 0), 0);

  const guardar = async () => {
    if (!movimiento) return;
    const cuerpo: Record<string, unknown> = {
      asiento: movimiento.asiento,
      naturaleza: naturaleza || undefined,
      soporte_tipo: soporteTipo || null,
      soporte,
      soporte_fecha: soporteFecha || null,
    };
    if (naturaleza === 'correccion_error') {
      Object.assign(cuerpo, {
        doc_electronico_resolucion: resolucion || null,
        doc_electronico_referencia: resolucionRef,
        doc_electronico_fecha: resolucionFecha || null,
        corrige_declaracion_anterior: corrige === '' ? null : corrige === 'si',
      });
    }
    if (naturaleza === 'devolucion_compra') {
      Object.assign(cuerpo, {
        invoice_purchase_id: facturaId,
        base: sumaBase,
        iva: sumaIva,
        lineas: elegidas.map((l) => ({ invoice_item_id: l.id, base: Number(l.base.replace(',', '.')), iva: Number(l.iva.replace(',', '.')) })),
      });
    }
    const v = validarNaturaleza(cuerpo);
    if (!v.ok) {
      setError(t(`errores.${v.error}`));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await clienteIva300.naturaleza({ asiento: v.asiento, ...v.datos });
      onGuardado();
    } catch (err) {
      const c = codigoDe(err);
      setError(t.has(`errores.${c}`) ? t(`errores.${c}`) : t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={movimiento !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('naturaleza.titulo')}
      descripcion={t('naturaleza.descripcion')}
      ancho={672}
      primario={{ etiqueta: t('naturaleza.guardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      {movimiento && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            <EnlaceAsiento id={movimiento.asiento} /> · {movimiento.fecha ?? '—'} · {formatear(movimiento.valor)}
            {movimiento.sugerida && ` · ${t('otros.sugerido', { naturaleza: t(`naturalezas.${movimiento.sugerida}`) })}`}
          </p>
          <FormField etiqueta={t('naturaleza.campo')} obligatorio>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={naturaleza}
                vacio={t('naturaleza.elegir')}
                onCambiar={(v) => setNaturaleza(v as NaturalezaMovimiento)}
                opciones={NATURALEZAS_MOVIMIENTO.filter((n) => n !== 'cierre').map((n) => ({ valor: n, etiqueta: t(`naturalezas.${n}`) }))}
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField etiqueta={t('naturaleza.soporteTipo')} obligatorio={naturaleza === 'devolucion_compra' || naturaleza === 'correccion_error'}>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={soporteTipo}
                  vacio={t('naturaleza.elegir')}
                  onCambiar={setSoporteTipo}
                  opciones={SOPORTES_MOVIMIENTO.map((s) => ({ valor: s, etiqueta: t(`soportesMovimiento.${s}`) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('naturaleza.soporte')} obligatorio ayuda={t('naturaleza.soporteAyuda')}>
              {(c) => <input id={c.id} className={CLASE_CAMPO} value={soporte} maxLength={500} onChange={(e) => setSoporte(e.target.value)} />}
            </FormField>
            <FormField etiqueta={t('naturaleza.soporteFecha')} obligatorio>
              {(c) => <input id={c.id} type="date" className={CLASE_CAMPO} value={soporteFecha} onChange={(e) => setSoporteFecha(e.target.value)} />}
            </FormField>
          </div>
          {naturaleza === 'correccion_error' && (
            <fieldset className="space-y-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t('naturaleza.correccionTitulo')}</legend>
              <p className="text-xs text-fg-secondary">{t('naturaleza.correccionAyuda')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField etiqueta={t('naturaleza.resolucion')}>
                  {(c) => (
                    <SelectNativo
                      id={c.id}
                      valor={resolucion}
                      vacio={t('naturaleza.elegir')}
                      onCambiar={setResolucion}
                      opciones={RESOLUCIONES_DOC_ELECTRONICO.map((r) => ({ valor: r, etiqueta: t(`resoluciones.${r}`) }))}
                    />
                  )}
                </FormField>
                <FormField etiqueta={t('naturaleza.resolucionReferencia')}>
                  {(c) => <input id={c.id} className={CLASE_CAMPO} value={resolucionRef} maxLength={120} onChange={(e) => setResolucionRef(e.target.value)} />}
                </FormField>
                <FormField etiqueta={t('naturaleza.resolucionFecha')}>
                  {(c) => <input id={c.id} type="date" className={CLASE_CAMPO} value={resolucionFecha} onChange={(e) => setResolucionFecha(e.target.value)} />}
                </FormField>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-fg">{t('naturaleza.corrigeDeclaracion')}</legend>
                <div className="flex gap-4">
                  {(['si', 'no'] as const).map((v) => (
                    <label key={v} className="inline-flex min-h-10 items-center gap-2 text-sm text-fg">
                      <input type="radio" name="corrige-declaracion" value={v} checked={corrige === v} onChange={() => setCorrige(v)} />
                      {t(`naturaleza.${v}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </fieldset>
          )}
          {naturaleza === 'devolucion_compra' && (
            <fieldset className="space-y-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t('naturaleza.devolucionTitulo')}</legend>
              <p className="text-xs text-fg-secondary">{t('naturaleza.facturaAyuda')}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <FormField etiqueta={t('naturaleza.factura')} className="flex-1">
                  {(c) => <input id={c.id} className={CLASE_CAMPO} value={factura} onChange={(e) => setFactura(e.target.value)} />}
                </FormField>
                <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void buscarFactura()} disabled={!factura.trim()}>
                  {t('naturaleza.buscar')}
                </button>
              </div>
              {lineas.length > 0 && (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {lineas.map((l, i) => (
                    <li key={l.id} className="grid gap-2 p-2 sm:grid-cols-[auto_1fr_8rem_8rem] sm:items-center">
                      <input
                        type="checkbox"
                        aria-label={l.descripcion}
                        checked={l.elegida}
                        onChange={(e) => setLineas((xs) => xs.map((x, j) => (j === i ? { ...x, elegida: e.target.checked } : x)))}
                      />
                      <span className="truncate text-sm text-fg">{l.descripcion || '—'}</span>
                      <input
                        aria-label={t('naturaleza.base')}
                        inputMode="decimal"
                        className={CLASE_CAMPO}
                        value={l.base}
                        onChange={(e) => setLineas((xs) => xs.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))}
                      />
                      <input
                        aria-label={t('naturaleza.iva')}
                        inputMode="decimal"
                        className={CLASE_CAMPO}
                        value={l.iva}
                        onChange={(e) => setLineas((xs) => xs.map((x, j) => (j === i ? { ...x, iva: e.target.value } : x)))}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {elegidas.length > 0 && <p className="text-xs tabular-nums text-fg-secondary">{t('naturaleza.totales', { base: formatear(sumaBase), iva: formatear(sumaIva) })}</p>}
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

function DeclaracionDialogo({
  abierto,
  desde,
  hasta,
  actual,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  desde: string;
  hasta: string;
  actual: Formulario300['periodoDeclarado'];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('finanzasIva300');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNumero(actual?.numeroFormulario ?? '');
    setFecha(actual?.presentadaEn ?? '');
    setError(null);
  }, [abierto, actual]);

  const enviar = async (quitar: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      await clienteIva300.declaracion(quitar ? { desde, hasta, presentada_en: null } : { desde, hasta, presentada_en: fecha, numero_formulario: numero });
      onGuardado();
    } catch (err) {
      const c = codigoDe(err);
      setError(t.has(`errores.${c}`) ? t(`errores.${c}`) : t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('declarado.dialogoTitulo')}
      descripcion={t('declarado.dialogoDescripcion', { desde, hasta })}
      ancho={440}
      primario={{ etiqueta: t('declarado.guardar'), onClick: () => void enviar(false), cargando: guardando }}
      secundarios={actual ? [{ etiqueta: t('declarado.quitar'), onClick: () => void enviar(true), destructiva: true }] : undefined}
    >
      <div className="space-y-4">
        <FormField etiqueta={t('declarado.numero')}>
          {(c) => <input id={c.id} className={CLASE_CAMPO} value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} />}
        </FormField>
        <FormField etiqueta={t('declarado.fecha')} obligatorio>
          {(c) => <input id={c.id} type="date" className={CLASE_CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

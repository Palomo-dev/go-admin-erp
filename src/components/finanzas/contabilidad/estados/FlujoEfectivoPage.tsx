'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';
import { AvisoTonal, Tarjeta, clasesBoton } from '@/components/kit';
import { BotonesExportar } from '../NivelReporte';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { filasDeSeccion, flujoCompleto, flujoCuadra, type FilaComparada } from '@/lib/finanzas/estados/presentacion';
import type { CuentaConValor, EstadoFlujos, SeccionFlujo } from '@/lib/finanzas/estados/tipos';
import { useConsultaInicial, useInforme, usePeriodo } from './clienteEstados';
import { BandaCuadre, CuerpoInforme, Fila, FilaTitulo, FiltrosPeriodo, PaginaInforme, Tabla, useCifra } from './PiezasEstado';
import { ClasificarCuentaDialogo } from './ClasificarCuentaDialogo';
import { PoliticasFlujoDialogo } from './PoliticasFlujoDialogo';

const SECCIONES: readonly SeccionFlujo[] = ['operacion', 'inversion', 'financiacion'];

export function FlujoEfectivoPage() {
  const t = useTranslations('estadosFinancieros.flujo');
  const { formatear } = useMonedaOrganizacion();
  const cifra = useCifra(formatear);
  const permisos = usePermisosFinanzas();
  const { formatDate } = useFormatDate();
  const periodo = usePeriodo();
  const [comparar, setComparar] = useState(true);
  const { estado, datos, consultar } = useInforme<EstadoFlujos>('flujo', periodo.desde, periodo.hasta, comparar);
  useConsultaInicial(!!periodo.desde, consultar);
  const [cuenta, setCuenta] = useState<CuentaConValor | null>(null);
  const [verPoliticas, setVerPoliticas] = useState(false);

  const actual = datos?.actual ?? null;
  const anterior = datos?.anterior ?? null;
  const anioActual = actual?.hasta.slice(0, 4) ?? '';
  const anioAnterior = anterior?.hasta.slice(0, 4) ?? '';

  const nombreFila = (f: FilaComparada): string => {
    if (f.texto) return t(`renglon.${f.texto}`);
    return f.nombre ?? t('grupo', { grupo: f.grupo ?? '' });
  };

  const secciones = useMemo(() => {
    if (!actual) return [];
    return SECCIONES.map((s) => ({ seccion: s, filas: filasDeSeccion(s, actual, anterior) }));
  }, [actual, anterior]);

  const exportar = useMemo(() => {
    if (!actual) return { columnas: [], filas: [] };
    const columnas = anterior ? [t('concepto'), anioActual, anioAnterior] : [t('concepto'), anioActual];
    const filas: (string | number)[][] = [];
    const fila = (concepto: string, a: number, b: number | null | undefined) =>
      filas.push(anterior ? [concepto, a, b ?? 0] : [concepto, a]);
    for (const { seccion, filas: renglones } of secciones) {
      if (seccion === 'operacion') fila(t('resultado'), actual.utilidad, anterior?.utilidad);
      for (const r of renglones) fila(nombreFila(r), r.actual, r.anterior);
      fila(t(`neto.${seccion}`), actual[seccion], anterior?.[seccion]);
    }
    if (actual.pendiente !== 0 || (anterior?.pendiente ?? 0) !== 0) fila(t('pendienteClasificar'), actual.pendiente, anterior?.pendiente);
    fila(t('variacion'), actual.variacion, anterior?.variacion);
    fila(t('inicial'), actual.efectivo_inicial, anterior?.efectivo_inicial);
    fila(t('efectoCambiario'), actual.efecto_cambiario, anterior?.efecto_cambiario);
    fila(t('final'), actual.efectivo_final, anterior?.efectivo_final);
    fila(t('restringido'), actual.restringido.final, anterior?.restringido.final);
    return { columnas, filas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, anterior, secciones]);

  const columnas = anterior ? 3 : 2;
  const celdas = (concepto: string, a: number, b: number | null | undefined) =>
    anterior ? [concepto, cifra(a), cifra(b)] : [concepto, cifra(a)];

  const pendientes = [...(actual?.pendientes_cuentas ?? []), ...(actual?.revisar_cuentas ?? [])];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      migas={t('miga')}
      icono={Banknote}
      acciones={actual && estado === 'listo' ? (
        <BotonesExportar
          nombre={`flujo-efectivo-${actual.desde}-${actual.hasta}`}
          titulo={t('titulo')}
          columnas={exportar.columnas}
          filas={exportar.filas}
        />
      ) : undefined}
    >
      <FiltrosPeriodo
        desde={periodo.desde}
        hasta={periodo.hasta}
        hoy={periodo.hoy}
        onDesde={periodo.setDesde}
        onHasta={periodo.setHasta}
        comparar={comparar}
        onComparar={setComparar}
        onConsultar={() => void consultar()}
        cargando={estado === 'cargando'}
      />
      <CuerpoInforme estado={estado} onReintentar={() => void consultar()}>
        {actual && (
          <>
            {!flujoCompleto(actual) && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('incompleto.titulo')}
                descripcion={t('incompleto.detalle', { cuentas: pendientes.length })}
              />
            )}
            {actual.cuentas_efectivo.some((c) => c.propuesta) && (
              <AvisoTonal tono="informacion" titulo={t('propuesta.titulo')} descripcion={t('propuesta.detalle')} />
            )}
            {!actual.politicas_confirmadas && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('politicas.pendienteTitulo')}
                descripcion={t('politicas.pendienteDetalle')}
                accion={{ etiqueta: t('politicas.ver'), onClick: () => setVerPoliticas(true) }}
              />
            )}
            {(actual.avisos.borradores > 0 || actual.avisos.fallos > 0) && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('sinContabilizar.titulo')}
                descripcion={t('sinContabilizar.detalle', {
                  borradores: actual.avisos.borradores,
                  fallos: actual.avisos.fallos,
                  monto: cifra(actual.avisos.fallos_monto),
                })}
                accion={{ etiqueta: t('sinContabilizar.ver'), href: '/app/finanzas/contabilidad/salud' }}
              />
            )}

            <Tabla etiqueta={t('titulo')} encabezados={anterior ? [t('concepto'), anioActual, anioAnterior] : [t('concepto'), anioActual]}>
              {secciones.map(({ seccion, filas }) => (
                <FilaGrupo key={seccion}>
                  <FilaTitulo columnas={columnas}>{t(`seccion.${seccion}`)}</FilaTitulo>
                  {seccion === 'operacion' && <Fila sangria celdas={celdas(t('resultado'), actual.utilidad, anterior?.utilidad)} />}
                  {filas.map((f) => <Fila key={f.clave} sangria celdas={celdas(nombreFila(f), f.actual, f.anterior)} />)}
                  <Fila fuerte celdas={celdas(t(`neto.${seccion}`), actual[seccion], anterior?.[seccion])} />
                </FilaGrupo>
              ))}
              {(actual.pendiente !== 0 || (anterior?.pendiente ?? 0) !== 0) && (
                <Fila fuerte celdas={celdas(t('pendienteClasificar'), actual.pendiente, anterior?.pendiente)} />
              )}
              <Fila fuerte celdas={celdas(t('variacion'), actual.variacion, anterior?.variacion)} />
              <Fila celdas={celdas(t('inicial'), actual.efectivo_inicial, anterior?.efectivo_inicial)} />
              <Fila celdas={celdas(t('efectoCambiario'), actual.efecto_cambiario, anterior?.efecto_cambiario)} />
              <Fila fuerte celdas={celdas(t('final'), actual.efectivo_final, anterior?.efectivo_final)} />
              <Fila celdas={celdas(t('restringido'), actual.restringido.final, anterior?.restringido.final)} />
            </Tabla>

            <BandaCuadre
              cuadra={flujoCuadra(actual)}
              titulo={flujoCuadra(actual) ? t('cuadra') : t('noCuadra', { diferencia: cifra(actual.diferencia) })}
              detalle={t('cuadraDetalle')}
            />

            {pendientes.length > 0 && (
              <Tarjeta titulo={t('pendientes.titulo')} descripcion={t('pendientes.detalle')} sinRelleno>
                <ul className="divide-y divide-line">
                  {pendientes.map((c) => (
                    <li key={c.cuenta} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span className="text-fg">
                        <span className="mr-2 font-mono text-xs text-fg-secondary">{c.cuenta}</span>
                        {c.nombre}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-fg">{cifra(c.valor)}</span>
                        {permisos.aprobar && (
                          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setCuenta(c)}>
                            {t('pendientes.clasificar')}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}

            {actual.sin_efectivo.length > 0 && (
              <Tarjeta titulo={t('sinEfectivo.titulo')} descripcion={t('sinEfectivo.detalle')} sinRelleno>
                <ul className="divide-y divide-line">
                  {actual.sin_efectivo.map((o) => (
                    <li key={o.asiento} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span className="text-fg">
                        <span className="mr-2 text-xs text-fg-secondary">{formatDate(o.fecha)}</span>
                        {o.memo ?? t('sinEfectivo.asiento', { id: o.asiento })}
                      </span>
                      <span className="tabular-nums text-fg">{cifra(o.monto)}</span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}

            <div className="flex justify-end">
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setVerPoliticas(true)}>
                {t('politicas.ver')}
              </button>
            </div>
          </>
        )}
      </CuerpoInforme>

      <ClasificarCuentaDialogo
        cuenta={cuenta}
        onCerrar={() => setCuenta(null)}
        onGuardado={() => { setCuenta(null); void consultar(); }}
      />
      <PoliticasFlujoDialogo
        abierto={verPoliticas}
        puedeEditar={permisos.aprobar}
        onCerrar={() => setVerPoliticas(false)}
        onGuardado={() => { setVerPoliticas(false); void consultar(); }}
      />
    </PaginaInforme>
  );
}

function FilaGrupo({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { AvisoTonal, CampoFecha, StatusBadge, clasesBoton } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { corteComparativo } from '@/lib/finanzas/reportes/estadosNiif';
import { descargarPdf } from '@/lib/finanzas/reportes/exportarReporte';
import { ORIGEN_NOTA, detalleNota, estadoDeNota, type EstadoNota } from '@/lib/finanzas/estados/notas';
import { NOTAS_CLAVES, type ClaveNota, type LibroInventarios, type NotaGuardada } from '@/lib/finanzas/estados/tipos';
import {
  ErrorServidor,
  guardarConfiguracionEstados,
  leerLibro,
  useConfiguracionEstados,
  usePeriodo,
  type EstadoCarga,
} from './clienteEstados';
import { CuerpoInforme, Fila, PaginaInforme, Tabla, useCifra } from './PiezasEstado';
import { useVisorInforme } from '@/components/reportes/especiales/contextoVisor';

const TONO: Record<EstadoNota, 'exito' | 'advertencia' | 'neutro'> = { completa: 'exito', por_revisar: 'advertencia', sin_datos: 'neutro' };

export function NotasEstadosPage() {
  const t = useTranslations('estadosFinancieros.notas');
  const { formatear } = useMonedaOrganizacion();
  const cifra = useCifra(formatear);
  const permisos = usePermisosFinanzas();
  const { hasta, setHasta, hoy } = usePeriodo();
  // En el visor de Reportes el corte es el fin de su periodo.
  const enVisor = !!useVisorInforme();
  const { config, estado: estadoConfig, recargar } = useConfiguracionEstados();
  const [libros, setLibros] = useState<{ actual: LibroInventarios; anterior: LibroInventarios } | null>(null);
  const [estadoLibro, setEstadoLibro] = useState<EstadoCarga>('cargando');
  const [abierta, setAbierta] = useState<ClaveNota | null>(null);
  const [textos, setTextos] = useState<Partial<Record<ClaveNota, NotaGuardada>>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!hasta) return;
    setEstadoLibro('cargando');
    try {
      const previo = corteComparativo(hasta);
      const [actual, anterior] = await Promise.all([
        leerLibro<LibroInventarios>('inventarios', hasta, hasta, 4),
        leerLibro<LibroInventarios>('inventarios', previo, previo, 4),
      ]);
      setLibros({ actual, anterior });
      setEstadoLibro('listo');
    } catch (error) {
      console.error('No se pudieron leer los saldos de las notas:', error);
      setLibros(null);
      setEstadoLibro(error instanceof ErrorServidor && error.codigo === 'sin_permiso' ? 'sinPermiso' : 'error');
    }
  }, [hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const nota = useCallback(
    (clave: ClaveNota): NotaGuardada => textos[clave] ?? config?.notas[clave] ?? {
      texto: clave === 'entidad' || clave === 'politicas' ? t(`plantilla.${clave}`) : '',
      revisada: false,
    },
    [textos, config, t],
  );

  const conCambios = Object.keys(textos).length > 0;

  const guardar = async () => {
    if (!config) return;
    setGuardando(true);
    try {
      await guardarConfiguracionEstados({ version: config.version, notas: textos });
      setTextos({});
      await recargar();
      toastSuccess(t('guardado'));
    } catch (error) {
      console.error('No se pudieron guardar las notas:', error);
      toastError(t(error instanceof ErrorServidor && error.codigo === 'version_obsoleta' ? 'versionObsoleta' : 'errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const exportarPdf = () => {
    if (!libros) return;
    const filas: string[][] = [];
    NOTAS_CLAVES.forEach((clave) => {
      filas.push([t(`nombre.${clave}`), nota(clave).texto]);
      for (const d of detalleNota(clave, libros.actual, libros.anterior)) {
        filas.push([`${d.codigo} ${d.nombre ?? ''}`, `${cifra(d.actual)} / ${cifra(d.anterior)}`]);
      }
    });
    void descargarPdf(`notas-${hasta}`, t('titulo'), [t('nota'), t('contenido')], filas);
  };

  const estado: EstadoCarga = estadoConfig !== 'listo' ? estadoConfig : estadoLibro;
  const detalle = useMemo(
    () => (abierta && libros ? detalleNota(abierta, libros.actual, libros.anterior) : []),
    [abierta, libros],
  );

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={hasta ? t('subtitulo', { corte: formatPlainDate(hasta) }) : undefined}
      migas={t('miga')}
      icono={FileText}
      acciones={(
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportarPdf} disabled={!libros}>PDF</button>
          {permisos.aprobar && (
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={!conCambios || guardando}>
              {t('guardar')}
            </button>
          )}
        </>
      )}
    >
      {!enVisor && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
          <label className="block min-w-40 space-y-1 text-xs text-fg-secondary">
            <span>{t('corte')}</span>
            <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} limpiable={false} />
          </label>
        </div>
      )}
      <CuerpoInforme estado={estado} onReintentar={() => void cargar()}>
        {config && (
          <>
            <AvisoTonal tono="informacion" titulo={t('aviso')} />
            <Tabla etiqueta={t('titulo')} encabezados={[t('nota'), t('origen'), t('estado'), '']}>
              {NOTAS_CLAVES.map((clave, i) => {
                const estadoNota = estadoDeNota(clave, config, libros?.actual ?? null);
                return (
                  <Fila
                    key={clave}
                    celdas={[
                      `${i + 1}. ${t(`nombre.${clave}`)}`,
                      t(`origenes.${ORIGEN_NOTA[clave]}`),
                      <StatusBadge key="estado" estado={estadoNota} etiqueta={t(`estados.${estadoNota}`)} tono={TONO[estadoNota]} />,
                      <button key="abrir" type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setAbierta(abierta === clave ? null : clave)}>
                        {t(abierta === clave ? 'cerrar' : 'abrir')}
                      </button>,
                    ]}
                  />
                );
              })}
            </Tabla>
            {abierta && (
              <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-fg">{t(`nombre.${abierta}`)}</p>
                <Textarea
                  aria-label={t(`nombre.${abierta}`)}
                  rows={6}
                  value={nota(abierta).texto}
                  readOnly={!permisos.aprobar}
                  onChange={(e) => setTextos({ ...textos, [abierta]: { ...nota(abierta), texto: e.target.value } })}
                />
                {permisos.aprobar && (
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={nota(abierta).revisada}
                      onChange={(e) => setTextos({ ...textos, [abierta]: { ...nota(abierta), revisada: e.target.checked } })}
                    />
                    {t('revisada')}
                  </label>
                )}
                {detalle.length > 0 && (
                  <Tabla etiqueta={t(`nombre.${abierta}`)} encabezados={[t('cuenta'), formatPlainDate(hasta), formatPlainDate(corteComparativo(hasta))]}>
                    {detalle.map((d) => <Fila key={d.codigo} celdas={[`${d.codigo} ${d.nombre ?? ''}`, cifra(d.actual), cifra(d.anterior)]} />)}
                  </Tabla>
                )}
              </div>
            )}
          </>
        )}
      </CuerpoInforme>
    </PaginaInforme>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import { AvisoTonal, CampoFecha, FormField, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { descargarPdfDocumento } from '@/lib/finanzas/reportes/exportarReporte';
import { faltantesCertificacion } from '@/lib/finanzas/estados/notas';
import type { Certificacion } from '@/lib/finanzas/estados/tipos';
import { ErrorServidor, guardarConfiguracionEstados, useConfiguracionEstados, usePeriodo } from './clienteEstados';
import { CuerpoInforme, PaginaInforme } from './PiezasEstado';
import { useVisorInforme } from '@/components/reportes/especiales/contextoVisor';

const CAMPOS = ['representante_nombre', 'representante_cedula', 'contador_nombre', 'contador_cedula', 'contador_tarjeta'] as const;

/**
 * Certificación de los estados financieros (artículo 37 de la Ley 222 de 1995).
 * El texto lo valida el Contador; generar el documento no firma por nadie.
 */
export function CertificacionPage() {
  const t = useTranslations('estadosFinancieros.certificacion');
  const permisos = usePermisosFinanzas();
  const { hasta, setHasta, hoy } = usePeriodo();
  // En el visor de Reportes el corte es el fin de su periodo.
  const enVisor = !!useVisorInforme();
  const { config, estado, recargar } = useConfiguracionEstados();
  const [c, setC] = useState<Certificacion>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (config) setC(config.certificacion); }, [config]);

  const base = t.raw('textoBase') as string;
  const texto = (c.texto ?? '').trim() || base;
  const parrafo = texto.replace('{corte}', hasta ? formatPlainDate(hasta) : '');
  const faltantes = config ? faltantesCertificacion(c, config.empresa) : [];
  const empresa = config ? `${config.empresa.nombre} · NIT ${config.empresa.nit}` : '';

  const guardar = async () => {
    if (!config) return;
    setGuardando(true);
    try {
      await guardarConfiguracionEstados({ version: config.version, certificacion: c });
      await recargar();
      toastSuccess(t('guardado'));
    } catch (error) {
      console.error('No se pudo guardar la certificación:', error);
      toastError(t(error instanceof ErrorServidor && error.codigo === 'version_obsoleta' ? 'versionObsoleta' : 'errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const firmas = [
    `${c.representante_nombre ?? ''} · ${t('representante')} · C.C. ${c.representante_cedula ?? ''}`,
    `${c.contador_nombre ?? ''} · ${t('contador')} · C.C. ${c.contador_cedula ?? ''} · T.P. ${c.contador_tarjeta ?? ''}`,
  ];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      migas={t('miga')}
      icono={BadgeCheck}
      acciones={(
        <>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario' })}
            disabled={!config}
            onClick={() => void descargarPdfDocumento(`certificacion-${hasta}`, empresa, t('titulo'), [parrafo], firmas)}
          >
            PDF
          </button>
          {permisos.aprobar && (
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando}>
              {t('guardar')}
            </button>
          )}
        </>
      )}
    >
      <CuerpoInforme estado={estado} onReintentar={() => void recargar()}>
        {config && (
          <>
            {!c.texto_validado && <AvisoTonal tono="advertencia" titulo={t('sinValidar.titulo')} descripcion={t('sinValidar.detalle')} />}
            {faltantes.length > 0 && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('faltan.titulo')}
                descripcion={faltantes.map((f) => t(`campo.${f}`)).join(', ')}
              />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
                {!enVisor && (
                  <FormField etiqueta={t('corte')}>
                    {() => <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} limpiable={false} />}
                  </FormField>
                )}
                {CAMPOS.map((campo) => (
                  <FormField key={campo} etiqueta={t(`campo.${campo}`)}>
                    <Input
                      value={c[campo] ?? ''}
                      readOnly={!permisos.aprobar}
                      maxLength={200}
                      onChange={(e) => setC({ ...c, [campo]: e.target.value })}
                    />
                  </FormField>
                ))}
                <FormField etiqueta={t('texto')} ayuda={t.raw('textoAyuda') as string}>
                  <Textarea
                    rows={6}
                    value={c.texto ?? base}
                    readOnly={!permisos.aprobar}
                    maxLength={5000}
                    onChange={(e) => setC({ ...c, texto: e.target.value })}
                  />
                </FormField>
                {permisos.aprobar && (
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={!!c.texto_validado}
                      onChange={(e) => setC({ ...c, texto_validado: e.target.checked })}
                    />
                    {t('validado')}
                  </label>
                )}
              </div>
              <article className="space-y-4 rounded-lg border border-line bg-surface p-8">
                <p className="text-xs text-fg-secondary">{empresa}</p>
                <h2 className="text-lg font-semibold text-fg">{t('titulo')}</h2>
                <p className="text-sm leading-6 text-fg">{parrafo}</p>
                <div className="grid gap-6 pt-10 sm:grid-cols-2">
                  <p className="border-t border-line-strong pt-2 text-xs text-fg-secondary">
                    {c.representante_nombre}<br />{t('representante')} · C.C. {c.representante_cedula}
                  </p>
                  <p className="border-t border-line-strong pt-2 text-xs text-fg-secondary">
                    {c.contador_nombre}<br />{t('contador')} · T.P. {c.contador_tarjeta}
                  </p>
                </div>
              </article>
            </div>
          </>
        )}
      </CuerpoInforme>
    </PaginaInforme>
  );
}

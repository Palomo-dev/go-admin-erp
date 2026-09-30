'use client';

/**
 * Certificado de retenciones de un proveedor (Figma «certificado-retenciones»,
 * docs/design/RETENCIONES-COMPRAS.md §6). Aquí solo se elige el periodo y se
 * ve cuánto se le retuvo; el documento lo arma el motor en el servidor
 * (tipo `certificado-retenciones`) con el mismo periodo y el mismo cálculo
 * (`fn_certificado_retenciones_proveedor`). Por defecto, el año en curso
 * hasta hoy.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileBadge } from 'lucide-react';
import { DateRangeButton, Dialogo, FilaDato, ListaDatos, type RangoFechas } from '@/components/kit';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { abrirDocumento, descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { addPlainDays } from '@/lib/utils/dateCore';
import { resumenCertificadoRetenciones, type ResumenCertificadoRetenciones } from '@/lib/services/compras/retenciones';

export interface CertificadoRetencionesDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  proveedorId: number;
  proveedorNombre: string;
  /** Periodo con el que abre (p. ej. el mes de la factura); por defecto, el año en curso. */
  rangoInicial?: RangoFechas;
}

/** El mes calendario de `dia` (YYYY-MM-DD), sin pasar de `hoy`: el periodo de una factura. */
export function rangoMesDe(dia: string, hoy: string): RangoFechas {
  const desde = `${dia.slice(0, 7)}-01`;
  const [anio, mes] = [Number(dia.slice(0, 4)), Number(dia.slice(5, 7))];
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const fin = addPlainDays(siguiente, -1);
  return { desde, hasta: fin < hoy ? fin : hoy };
}

export function CertificadoRetencionesDialog({ abierto, onAbiertoChange, proveedorId, proveedorNombre, rangoInicial }: CertificadoRetencionesDialogProps) {
  const t = useTranslations('cuentasPorPagar.certificado');
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const [rango, setRango] = useState<RangoFechas>(() => rangoInicial ?? { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
  const [resumen, setResumen] = useState<ResumenCertificadoRetenciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (abierto) setRango(rangoInicial ?? { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
    // Solo al abrir: después manda el periodo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cargar = useCallback(async () => {
    if (!rango.desde || !rango.hasta) return;
    setCargando(true);
    setError(false);
    try {
      setResumen(await resumenCertificadoRetenciones(getOrganizationId(), proveedorId, rango.desde, rango.hasta));
    } catch (e) {
      console.error('Error leyendo las retenciones del proveedor:', e);
      setResumen(null);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [proveedorId, rango.desde, rango.hasta]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const periodo = { desde: rango.desde || undefined, hasta: rango.hasta || undefined };
  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarDocumento('certificado-retenciones', proveedorId, periodo);
    } catch (e) {
      console.error('Error descargando el certificado de retenciones:', e);
      toastError(t('errorDescarga'));
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { proveedor: proveedorNombre })}
      icono={FileBadge}
      primario={{ etiqueta: t('descargar'), onClick: () => void descargar(), cargando: descargando, deshabilitada: cargando || error }}
      secundarios={[
        { etiqueta: t('imprimir'), onClick: () => imprimirDocumento('certificado-retenciones', proveedorId, periodo), deshabilitada: cargando || error },
        { etiqueta: t('ver'), onClick: () => abrirDocumento('certificado-retenciones', proveedorId, periodo), deshabilitada: cargando || error },
      ]}
      textoCancelar={t('cerrar')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">{t('periodo')}</span>
        <DateRangeButton hoy={hoy} etiqueta={t('periodo')} valor={rango} onValorChange={(r) => setRango({ desde: r.desde || '', hasta: r.hasta || '' })} />
      </div>
      {cargando ? (
        <p role="status" className="text-sm text-fg-secondary">{t('cargando')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger-text">
          {t('errorLectura')}{' '}
          <button type="button" onClick={() => void cargar()} className="font-medium text-brand underline-offset-2 hover:underline">
            {t('reintentar')}
          </button>
        </p>
      ) : resumen ? (
        <>
          <ListaDatos etiqueta={t('titulo')}>
            <FilaDato etiqueta={t('clases.retefuente')} valor={formatear(resumen.retefuente)} />
            <FilaDato etiqueta={t('clases.reteiva')} valor={formatear(resumen.reteiva)} />
            <FilaDato etiqueta={t('clases.reteica')} valor={formatear(resumen.reteica)} />
            <FilaDato
              separadorAntes
              tamano="lg"
              etiqueta={t('total')}
              descripcion={t('alcance', { facturas: resumen.facturas, conceptos: resumen.conceptos })}
              valor={formatear(resumen.retenido)}
            />
          </ListaDatos>
          {resumen.retenido === 0 && <p className="text-sm text-fg-secondary">{t('sinRetenciones')}</p>}
        </>
      ) : null}
      <p className="text-xs text-fg-secondary">{t('nota')}</p>
    </Dialogo>
  );
}

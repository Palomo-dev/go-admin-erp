'use client';

/**
 * Certificado de retenciones de un proveedor (Figma 09 · «Certificado de
 * retenciones (Nuevo · propuesta)» 1491:126182, docs/design/RETENCIONES-COMPRAS.md).
 *
 * Aquí solo se elige el periodo en meses y se ve cuánto se le retuvo
 * (`fn_certificado_retenciones_proveedor`, el mismo cálculo del documento).
 * «Expedir certificado» llama al servidor, que toma el siguiente número de la
 * serie CR de la organización y guarda la foto (si ya había uno idéntico del
 * periodo, devuelve ese mismo). Después, «Ver», «Imprimir» y «Descargar PDF»
 * piden al motor de documentos el certificado EXPEDIDO por su id. Antes de
 * expedir, «Vista previa» muestra el borrador sin número.
 *
 * Se abre desde el detalle del proveedor (año en curso) y desde la factura,
 * la CxP o el asiento de una compra (el mes de la factura y su sucursal).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileBadge } from 'lucide-react';
import { Dialogo, FilaDato, FormField, ListaDatos, StatusBadge, type RangoFechas } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { abrirDocumento, descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { rangoDeMeses } from '@/lib/documents/certificadoRetenciones';
import { resumenCertificadoRetenciones, type ResumenCertificadoRetenciones } from '@/lib/services/compras/retenciones';
import { ErrorPeticionCompra, clienteCompras } from '@/lib/services/compras/clienteCompras';

export interface CertificadoRetencionesDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  proveedorId: number;
  proveedorNombre: string;
  /** Periodo con el que abre (p. ej. el mes de la factura); por defecto, el año en curso. Se toma en meses. */
  rangoInicial?: RangoFechas;
  /** Sucursal del documento de origen: tarjeta «Sucursal» y ciudad de la retención del certificado. */
  sucursalId?: number | null;
}

interface Expedido {
  id: string;
  numero: string;
  reexpedido: boolean;
}

/** El mes calendario de `dia` (YYYY-MM-DD), sin pasar de `hoy`: el periodo de una factura. */
export function rangoMesDe(dia: string, hoy: string): RangoFechas {
  const mes = dia.slice(0, 7);
  return rangoDeMeses(mes, mes, hoy) ?? { desde: `${mes}-01`, hasta: hoy };
}

export function CertificadoRetencionesDialog({
  abierto,
  onAbiertoChange,
  proveedorId,
  proveedorNombre,
  rangoInicial,
  sucursalId = null,
}: CertificadoRetencionesDialogProps) {
  const t = useTranslations('cuentasPorPagar.certificado');
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const mesActual = hoy.slice(0, 7);
  const mesesIniciales = useCallback(
    () => ({
      desde: rangoInicial?.desde ? rangoInicial.desde.slice(0, 7) : `${hoy.slice(0, 4)}-01`,
      hasta: rangoInicial?.hasta ? rangoInicial.hasta.slice(0, 7) : mesActual,
    }),
    [rangoInicial?.desde, rangoInicial?.hasta, hoy, mesActual],
  );
  const [meses, setMeses] = useState(mesesIniciales);
  const [resumen, setResumen] = useState<ResumenCertificadoRetenciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [expidiendo, setExpidiendo] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [expedido, setExpedido] = useState<Expedido | null>(null);

  const rango = useMemo(() => rangoDeMeses(meses.desde, meses.hasta, hoy), [meses.desde, meses.hasta, hoy]);

  useEffect(() => {
    if (abierto) {
      setMeses(mesesIniciales());
      setExpedido(null);
    }
    // Solo al abrir: después manda el periodo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Otro periodo es otro certificado: lo expedido deja de aplicar.
  useEffect(() => setExpedido(null), [rango?.desde, rango?.hasta]);

  const cargar = useCallback(async () => {
    if (!rango) return;
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
  }, [proveedorId, rango]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const expedir = async () => {
    if (!rango) return;
    setExpidiendo(true);
    try {
      setExpedido(await clienteCompras.expedirCertificadoRetenciones(proveedorId, { desde: rango.desde, hasta: rango.hasta, sucursalId }));
    } catch (e) {
      console.error('Error expidiendo el certificado de retenciones:', e);
      toastError(e instanceof ErrorPeticionCompra && e.estado === 403 ? t('errorPermiso') : t('errorExpedir'));
    } finally {
      setExpidiendo(false);
    }
  };

  const descargar = async (id: string) => {
    setDescargando(true);
    try {
      await descargarDocumento('certificado-retenciones', id);
    } catch (e) {
      console.error('Error descargando el certificado de retenciones:', e);
      toastError(t('errorDescarga'));
    } finally {
      setDescargando(false);
    }
  };

  const bloqueado = !rango || cargando || error;
  const vistaPrevia = () =>
    rango &&
    abrirDocumento('certificado-retenciones', proveedorId, {
      desde: rango.desde,
      hasta: rango.hasta,
      parametros: sucursalId ? { sucursal: String(sucursalId) } : undefined,
    });

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { proveedor: proveedorNombre })}
      icono={FileBadge}
      primario={
        expedido
          ? { etiqueta: t('descargar'), onClick: () => void descargar(expedido.id), cargando: descargando }
          : { etiqueta: t('expedir'), onClick: () => void expedir(), cargando: expidiendo, deshabilitada: bloqueado }
      }
      secundarios={
        expedido
          ? [
              { etiqueta: t('imprimir'), onClick: () => imprimirDocumento('certificado-retenciones', expedido.id) },
              { etiqueta: t('ver'), onClick: () => abrirDocumento('certificado-retenciones', expedido.id) },
            ]
          : [{ etiqueta: t('vistaPrevia'), onClick: () => void vistaPrevia(), deshabilitada: bloqueado }]
      }
      textoCancelar={t('cerrar')}
    >
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-fg">{t('periodo')}</legend>
        <FormField etiqueta={t('desdeMes')}>
          <Input
            type="month"
            value={meses.desde}
            max={mesActual}
            onChange={(e) => setMeses((m) => ({ ...m, desde: e.target.value }))}
          />
        </FormField>
        <FormField etiqueta={t('hastaMes')}>
          <Input
            type="month"
            value={meses.hasta}
            min={meses.desde || undefined}
            max={mesActual}
            onChange={(e) => setMeses((m) => ({ ...m, hasta: e.target.value }))}
          />
        </FormField>
      </fieldset>
      {!rango ? (
        <p role="alert" className="text-sm text-danger-text">{t('periodoInvalido')}</p>
      ) : cargando ? (
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
            {expedido && (
              <FilaDato
                etiqueta={t('numero')}
                valor={expedido.numero}
                accesorio={<StatusBadge estado="issued" etiqueta={t('expedido')} />}
              />
            )}
          </ListaDatos>
          {expedido?.reexpedido && <p role="status" className="text-sm text-fg-secondary">{t('reexpedido')}</p>}
          {resumen.retenido === 0 && <p className="text-sm text-fg-secondary">{t('sinRetenciones')}</p>}
        </>
      ) : null}
      <p className="text-xs text-fg-secondary">{t('nota')}</p>
    </Dialogo>
  );
}

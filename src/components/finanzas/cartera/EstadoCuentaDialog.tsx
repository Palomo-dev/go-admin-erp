'use client';

/**
 * Estado de cuenta del cliente (Figma X3 `740:52422`) sobre la pieza del kit
 * (`kit/documento/EstadoCuentaDialog`, compartida con CxP). Aquí queda lo del
 * dominio: los datos salen de `GET /api/clientes/[id]/estado-cuenta` (el mismo
 * cargador que el PDF del motor de documentos), el PDF se descarga o imprime
 * con el motor (tipo `estado-cuenta`, mismo rango) y el envío por correo va a
 * `POST /api/clientes/[id]/estado-cuenta/enviar` con el PDF adjunto.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { EstadoCuentaDialog as EstadoCuentaKit, FormField, inicioDeMes, type EstadoCuentaVista, type RangoFechas } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { ErrorPeticionCartera, enviarEstadoCuenta, pedirEstadoCuenta } from '@/lib/finanzas/cartera/clienteCartera';

export interface EstadoCuentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  clienteId: string;
  clienteNombre?: string | null;
  correo?: string | null;
  hoy: string;
  origen?: 'pos' | 'finanzas';
}

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EstadoCuentaDialog({ abierto, onAbiertoChange, clienteId, clienteNombre, correo, hoy, origen = 'finanzas' }: EstadoCuentaDialogProps) {
  const t = useTranslations('cartera.estadoCuenta');
  const moneda = useMonedaOrganizacion();
  const { formatPlain } = useFormatDate();
  const [rango, setRango] = useState<RangoFechas>({ desde: inicioDeMes(hoy), hasta: hoy });
  const [datos, setDatos] = useState<EstadoCuentaVista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [para, setPara] = useState(correo ?? '');
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setRango({ desde: inicioDeMes(hoy), hasta: hoy });
    setPara(correo ?? '');
  }, [abierto, hoy, correo]);

  const textoError = useCallback(
    (codigo: string) => {
      const k = `errores.${codigo}`;
      return t.has(k) ? t(k as never) : t('errores.error_desconocido');
    },
    [t],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await pedirEstadoCuenta(clienteId, { desde: rango.desde || null, hasta: rango.hasta || null }));
    } catch (e) {
      setError(textoError(e instanceof ErrorPeticionCartera ? e.codigo : 'error_desconocido'));
    } finally {
      setCargando(false);
    }
  }, [clienteId, rango.desde, rango.hasta, textoError]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const rangoDocumento = { desde: rango.desde || undefined, hasta: rango.hasta || undefined };

  const descargarPdf = async () => {
    setDescargando(true);
    try {
      await descargarDocumento('estado-cuenta', clienteId, rangoDocumento);
    } catch {
      toastError(t('errorPdf'));
    } finally {
      setDescargando(false);
    }
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await enviarEstadoCuenta(clienteId, {
        para: para.trim() || undefined,
        desde: rango.desde || null,
        hasta: rango.hasta || null,
        origen,
      });
      toastSuccess(t('enviado'), r.adjunto ? t('enviadoA', { destino: r.destino }) : t('enviadoSinAdjunto', { destino: r.destino }));
    } catch (e) {
      toastError(t('noEnviado'), textoError(e instanceof ErrorPeticionCartera ? e.codigo : 'error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <EstadoCuentaKit
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      tercero={{ tipo: 'cliente', nombre: clienteNombre ?? '' }}
      datos={datos}
      cargando={cargando}
      error={error}
      onReintentar={() => void cargar()}
      rango={rango}
      onRangoChange={(r) => setRango({ desde: r.desde || '', hasta: r.hasta || '' })}
      hoy={hoy}
      moneda={moneda.paraDocumento(null)}
      formatearDia={formatPlain}
      nombreArchivo={`${t('archivo')}_${hoy}`}
      onErrorDescarga={() => toastError(t('errorPdf'))}
      pdf={{
        onDescargar: () => void descargarPdf(),
        onImprimir: () => imprimirDocumento('estado-cuenta', clienteId, rangoDocumento),
        cargando: descargando,
      }}
      secundarios={[{ etiqueta: t('enviarCorreo'), onClick: () => void enviar(), cargando: enviando, deshabilitada: !para.trim(), motivo: t('sinCorreo') }]}
      opciones={
        <FormField etiqueta={t('para')}>
          {(c) => (
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
              <input
                id={c.id}
                type="email"
                value={para}
                onChange={(e) => setPara(e.target.value)}
                placeholder={t('paraPlaceholder')}
                className={`${CLASES_CAMPO} pl-9`}
              />
            </div>
          )}
        </FormField>
      }
    />
  );
}

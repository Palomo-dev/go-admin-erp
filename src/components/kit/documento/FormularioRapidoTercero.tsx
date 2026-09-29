'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { nitCheckDigit } from '@/lib/services/customers/customerPayload';
import { CampoNumero } from '../CampoNumero';
import { FormField } from '../FormField';
import { SegmentedControl } from '../SegmentedControl';
import { useKitT } from '../useIdiomaKit';
import {
  TIPOS_DOCUMENTO_TERCERO,
  cambiarTipoPersona,
  terceroRapidoInicial,
  validarTerceroRapido,
  type DatosTerceroRapido,
  type TipoPersona,
  type VarianteTercero,
} from './edicionDocumentoLogica';

/**
 * Formulario rápido de tercero dentro de «Elegir cliente / proveedor» (Figma
 * `QuickCustomerForm`; «Diálogo / Crear cliente en línea» `1036:103119`,
 * «Diálogo / Crear proveedor — formulario rápido» `1045:105618`): tipo de
 * persona, documento con DV (calculado para NIT), nombre o razón social,
 * contacto (proveedor), correo, teléfono y días de crédito (proveedor).
 *
 * «Crear y elegir» llama al servicio de la pantalla (`onCrear`: el mismo
 * alta de clientes o de proveedores de la app) y devuelve el tercero ya
 * elegido. «Más datos» abre el formulario completo.
 */
export interface FormularioRapidoTerceroProps<T> {
  variante: VarianteTercero;
  texto: string;
  onCrear: (datos: DatosTerceroRapido) => Promise<T>;
  onCreado: (tercero: T) => void;
  onCancelar: () => void;
  onMasDatos?: () => void;
  mensajeError?: (error: unknown) => string;
}

const claseCampo =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function FormularioRapidoTercero<T>({ variante, texto, onCrear, onCreado, onCancelar, onMasDatos, mensajeError }: FormularioRapidoTerceroProps<T>) {
  const t = useKitT();
  const [datos, setDatos] = useState<DatosTerceroRapido>(() => terceroRapidoInicial(variante, texto));
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refPrimero = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    refPrimero.current?.focus();
  }, []);

  const errores = validarTerceroRapido(datos, variante);
  const textoError = (c: keyof DatosTerceroRapido) => (intentado && errores[c] ? t(`documentoEdicion.tercero.errores.${errores[c]}` as never) : null);
  const cambiar = (c: Partial<DatosTerceroRapido>) =>
    setDatos((d) => {
      const n = { ...d, ...c };
      // DV del NIT: se calcula al escribir el número (se puede corregir a mano).
      if ('numeroDocumento' in c && n.tipoDocumento === 'nit') {
        const dv = nitCheckDigit(n.numeroDocumento);
        n.dv = dv === null ? '' : String(dv);
      }
      return n;
    });

  const crear = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    setGuardando(true);
    setError(null);
    try {
      onCreado(await onCrear(datos));
    } catch (e) {
      setError(mensajeError ? mensajeError(e) : t('documentoEdicion.tercero.errorCrear'));
    } finally {
      setGuardando(false);
    }
  };

  const empresa = datos.tipo === 'empresa';
  const ref = (campo: 'nombres' | 'razonSocial') => (empresa ? campo === 'razonSocial' : campo === 'nombres') ? refPrimero : undefined;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
    >
      {error && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <FormField etiqueta={t('documentoEdicion.tercero.tipo')}>
        {(c) => (
          <SegmentedControl<TipoPersona>
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={datos.tipo}
            onValorChange={(v) => setDatos((d) => cambiarTipoPersona(d, v))}
            opciones={[
              { valor: 'persona', etiqueta: t('documentoEdicion.tercero.persona') },
              { valor: 'empresa', etiqueta: t('documentoEdicion.tercero.empresa') },
            ]}
          />
        )}
      </FormField>
      <div className="grid grid-cols-[112px_1fr_64px] gap-2">
        <FormField etiqueta={t('documentoEdicion.tercero.tipoDocumento')}>
          <select value={datos.tipoDocumento} onChange={(e) => cambiar({ tipoDocumento: e.target.value, dv: '' })} className={claseCampo}>
            {TIPOS_DOCUMENTO_TERCERO.map((d) => (
              <option key={d} value={d}>
                {t(`documentoEdicion.tercero.documentos.${d}` as never)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={t('documentoEdicion.tercero.numero')} obligatorio={variante === 'cliente'} error={textoError('numeroDocumento')}>
          <Input value={datos.numeroDocumento} inputMode="numeric" maxLength={20} onChange={(e) => cambiar({ numeroDocumento: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('documentoEdicion.tercero.dv')} error={textoError('dv')}>
          <Input value={datos.dv} inputMode="numeric" maxLength={1} disabled={datos.tipoDocumento !== 'nit'} onChange={(e) => cambiar({ dv: e.target.value })} className="h-10" />
        </FormField>
      </div>
      {empresa ? (
        <FormField etiqueta={t('documentoEdicion.tercero.razonSocial')} obligatorio error={textoError('razonSocial')}>
          {(c) => (
            <Input
              ref={ref('razonSocial')}
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              aria-required={c['aria-required']}
              value={datos.razonSocial}
              maxLength={200}
              onChange={(e) => cambiar({ razonSocial: e.target.value })}
              className="h-10"
            />
          )}
        </FormField>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FormField etiqueta={t('documentoEdicion.tercero.nombres')} obligatorio error={textoError('nombres')}>
            {(c) => (
              <Input
                ref={ref('nombres')}
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                aria-required={c['aria-required']}
                value={datos.nombres}
                maxLength={100}
                onChange={(e) => cambiar({ nombres: e.target.value })}
                className="h-10"
              />
            )}
          </FormField>
          <FormField etiqueta={t('documentoEdicion.tercero.apellidos')}>
            <Input value={datos.apellidos} maxLength={100} onChange={(e) => cambiar({ apellidos: e.target.value })} className="h-10" />
          </FormField>
        </div>
      )}
      {variante === 'proveedor' && (
        <FormField etiqueta={t('documentoEdicion.tercero.contacto')}>
          <Input value={datos.contacto} maxLength={150} onChange={(e) => cambiar({ contacto: e.target.value })} className="h-10" />
        </FormField>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FormField etiqueta={t('documentoEdicion.tercero.correo')} error={textoError('correo')}>
          <Input type="email" value={datos.correo} maxLength={150} onChange={(e) => cambiar({ correo: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('documentoEdicion.tercero.telefono')}>
          <Input type="tel" value={datos.telefono} maxLength={30} onChange={(e) => cambiar({ telefono: e.target.value })} className="h-10" />
        </FormField>
      </div>
      {variante === 'proveedor' && (
        <FormField etiqueta={t('documentoEdicion.tercero.diasCredito')} error={textoError('diasCredito')}>
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={datos.diasCredito}
              decimales={0}
              minimo={0}
              maximo={365}
              sufijo={t('documentoEdicion.tercero.dias')}
              onValorChange={(v) => cambiar({ diasCredito: v })}
            />
          )}
        </FormField>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
        {onMasDatos && (
          <button
            type="button"
            onClick={onMasDatos}
            disabled={guardando}
            className="rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:mr-auto"
          >
            {t('documentoEdicion.tercero.masDatos')}
          </button>
        )}
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          {t('comun.cancelar')}
        </button>
        <button
          type="submit"
          disabled={guardando}
          aria-busy={guardando || undefined}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {t('documentoEdicion.tercero.crear')}
        </button>
      </div>
    </form>
  );
}

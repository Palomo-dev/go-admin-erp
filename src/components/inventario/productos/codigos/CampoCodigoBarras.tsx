'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { validarCodigoBarras, type FormatoCodigo } from '@/lib/utils/codigoBarras';
import { buscarConflictos, claveErrorCodigos, reservarCodigo, type ConflictoCodigo } from '@/lib/services/codigosBarrasService';
import { cn } from '@/utils/Utils';

export type EstadoCodigo = 'vacio' | 'validando' | 'valido' | 'invalido' | 'duplicado' | 'sinVerificar';

/**
 * Campo «Código de barras» del producto y de la variante (Figma «Campo
 * “Código de barras” en el formulario de producto» y «… en la variante»,
 * sección `518:273568`).
 *
 * Sustituye a las dos copias del generador al azar: «Generar» pide al
 * servidor el siguiente código libre de la numeración de la organización y,
 * al escribir a mano, se valida el formato (dígito de control de EAN-13/EAN-8,
 * caracteres de Code128) y que ningún otro producto o variante de la
 * organización lo use. Quien lo usa recibe el estado para no guardar un
 * duplicado.
 */
export interface CampoCodigoBarrasProps {
  value: string;
  onChange: (valor: string) => void;
  /** Ids que no cuentan como duplicado (el propio producto o variante al editar). */
  excluirIds?: number[];
  onEstadoChange?: (estado: EstadoCodigo) => void;
  /** Texto de ayuda propio (la variante dice de qué talla es). */
  ayuda?: string;
  /** Campo de una variante: la ayuda recuerda que no hereda el código del padre. */
  variante?: boolean;
  etiqueta?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export function CampoCodigoBarras({
  value,
  onChange,
  excluirIds,
  onEstadoChange,
  ayuda,
  variante = false,
  etiqueta,
  id,
  className,
  disabled,
}: CampoCodigoBarrasProps) {
  const t = useTranslations('inventarioEtiquetas.codigos.campo');
  const tc = useTranslations('inventarioEtiquetas.codigos');
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [estado, setEstado] = useState<EstadoCodigo>('vacio');
  const [formato, setFormato] = useState<FormatoCodigo | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<ConflictoCodigo | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);
  const turno = useRef(0);
  const excluir = (excluirIds ?? []).filter((n) => Number.isFinite(n) && n > 0).join(',');

  const cambiarEstado = (e: EstadoCodigo) => {
    setEstado(e);
    onEstadoChange?.(e);
  };

  useEffect(() => {
    const codigo = value.trim();
    const miTurno = ++turno.current;
    setConflicto(null);
    if (!codigo) {
      setMensaje(null);
      setFormato(null);
      cambiarEstado('vacio');
      return;
    }
    const v = validarCodigoBarras(codigo);
    setFormato(v.formato);
    if (!v.valido) {
      setMensaje(
        v.motivo === 'digitoControl'
          ? t('errorDigito', { formato: v.formato === 'ean8' ? 'EAN-8' : 'EAN-13', cuerpo: codigo.slice(0, -1), digito: v.digitoEsperado ?? 0 })
          : v.motivo === 'largo'
            ? t('errorLargo')
            : t('errorCaracteres'),
      );
      cambiarEstado('invalido');
      return;
    }
    if (!orgId) {
      cambiarEstado('sinVerificar');
      return;
    }
    cambiarEstado('validando');
    const temporizador = setTimeout(async () => {
      try {
        const otros = await buscarConflictos(orgId, codigo, excluir ? excluir.split(',').map(Number) : []);
        if (miTurno !== turno.current) return;
        if (otros.length > 0) {
          setConflicto(otros[0]);
          cambiarEstado('duplicado');
        } else {
          setMensaje(null);
          cambiarEstado('valido');
        }
      } catch {
        if (miTurno === turno.current) cambiarEstado('sinVerificar');
      }
    }, 400);
    return () => clearTimeout(temporizador);
    // cambiarEstado solo avisa hacia fuera: no debe relanzar la validación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, orgId, excluir, t]);

  const generar = async () => {
    if (!orgId) return;
    setGenerando(true);
    setErrorGenerar(null);
    try {
      onChange(await reservarCodigo(orgId));
    } catch (e) {
      setErrorGenerar(tc(claveErrorCodigos(e)));
    } finally {
      setGenerando(false);
    }
  };

  const nombreFormato = formato === 'ean13' ? 'EAN-13' : formato === 'ean8' ? 'EAN-8' : 'Code128';
  const error =
    errorGenerar ??
    (estado === 'invalido'
      ? mensaje
      : estado === 'duplicado' && conflicto
        ? conflicto.esVariante && conflicto.nombrePadre
          ? t('duplicadoVariante', { nombre: conflicto.nombrePadre, variante: conflicto.nombre })
          : t('duplicado', { nombre: conflicto.nombre })
        : null);

  const textoAyuda =
    estado === 'validando' ? (
      <span className="inline-flex items-center gap-1">
        <Loader2 aria-hidden="true" className="size-3 animate-spin" /> {t('verificando')}
      </span>
    ) : estado === 'valido' ? (
      <span className="inline-flex items-center gap-1 text-success-text">
        <Check aria-hidden="true" className="size-3" strokeWidth={2} /> {t('libre', { formato: nombreFormato })}
      </span>
    ) : estado === 'sinVerificar' ? (
      t('sinVerificar')
    ) : (
      ayuda ?? (variante ? t('ayudaVariante') : t('ayuda'))
    );

  return (
    <FormField etiqueta={etiqueta ?? t('etiqueta')} error={error} ayuda={error ? undefined : textoAyuda} id={id} className={className}>
      {(campo) => (
        <div className="flex gap-2">
          <Input
            id={campo.id}
            aria-describedby={campo['aria-describedby']}
            aria-invalid={campo['aria-invalid']}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('placeholder')}
            disabled={disabled}
            autoComplete="off"
            className={cn('h-10 min-w-0 flex-1 font-mono', error && 'border-danger')}
          />
          <button
            type="button"
            onClick={() => void generar()}
            disabled={disabled || generando || !orgId}
            title={t('generarTitulo')}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generando ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            )}
            {t('generar')}
          </button>
        </div>
      )}
    </FormField>
  );
}

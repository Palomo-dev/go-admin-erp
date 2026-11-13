'use client';

/**
 * «Conexión» de Instagram y Messenger (Figma 91-chat-22, mismo patrón que
 * WhatsApp Cloud API): campos de la cuenta de Meta, tokens con «Ver»
 * (credenciales visibles, sin cifrar por ahora), Guardar y Verificar.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { AvisoTonal, FormField, Tarjeta, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { enmascarar } from './detalleLogica';

export interface CampoCredencial {
  clave: string;
  etiqueta: string;
  /** Token o secreto: se muestra enmascarado hasta «Ver». */
  secreto?: boolean;
  ayuda?: string;
  ancho?: 'medio' | 'completo';
}

export interface CredencialesMetaProps {
  campos: readonly CampoCredencial[];
  valores: Record<string, string | undefined> | null | undefined;
  /** `null` si aún no hay credenciales guardadas. */
  estado: { is_valid: boolean; last_validated_at: string | null } | null;
  guardando: boolean;
  validando: boolean;
  onGuardar: (valores: Record<string, string>) => Promise<void>;
  onValidar: () => Promise<void>;
}

export function CredencialesMeta({ campos, valores, estado, guardando, validando, onGuardar, onValidar }: CredencialesMetaProps) {
  const t = useTranslations('chatModulo.canales.detalleCanal.credenciales');
  const { formatDate } = useFormatDate();
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [ver, setVer] = useState(false);

  useEffect(() => {
    setDatos(Object.fromEntries(campos.map((c) => [c.clave, valores?.[c.clave] ?? ''])));
  }, [campos, valores]);

  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion')}>
      <div className="flex flex-col gap-4">
        {estado ? (
          <AvisoTonal
            tono={estado.is_valid ? 'exito' : 'peligro'}
            compacto
            titulo={
              estado.is_valid
                ? estado.last_validated_at
                  ? t('verificadoEl', { fecha: formatDate(estado.last_validated_at) })
                  : t('verificado')
                : t('invalido')
            }
          />
        ) : (
          <AvisoTonal tono="informacion" compacto titulo={t('sinCredenciales')} />
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {campos.map((c) => (
            <FormField key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} className={c.ancho === 'completo' ? 'md:col-span-2' : undefined}>
              <Input
                value={c.secreto && !ver ? enmascarar(datos[c.clave]) : (datos[c.clave] ?? '')}
                readOnly={c.secreto && !ver && !!datos[c.clave]}
                onChange={(e) => setDatos((d) => ({ ...d, [c.clave]: e.target.value }))}
                className="font-mono"
              />
            </FormField>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onGuardar(datos)} disabled={guardando} className={clasesBoton({ tamano: 'sm' })}>
            {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('guardar')}
          </button>
          <button type="button" onClick={onValidar} disabled={validando || !estado} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {validando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('verificar')}
          </button>
          <button type="button" onClick={() => setVer((v) => !v)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            {ver ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {ver ? t('ocultar') : t('ver')}
          </button>
        </div>
      </div>
    </Tarjeta>
  );
}

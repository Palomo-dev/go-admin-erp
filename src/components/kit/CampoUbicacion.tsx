'use client';

/**
 * País + Ciudad (decisión de ubicación del 2026-09-29; Figma sección 18, fila 9;
 * docs/design/AUTH-ACCESO-V2.md §13).
 *
 * - País: obligatorio, prellenado según el navegador (zona horaria e idioma),
 *   nunca «Colombia» fijo; si no se puede deducir, queda vacío.
 * - Ciudad: UN solo campo con buscador sobre `municipalities` que llena el
 *   departamento (antes: departamento y ciudad en dos listas). Para países sin
 *   municipios en el catálogo, ciudad y estado/provincia se escriben.
 *
 * Lo usan el registro (organización y sucursal) y el asistente «Nueva
 * organización» de la app.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { FormField } from '@/components/kit/FormField';
import { SearchSelect } from '@/components/ui/search-select';
import { Input } from '@/components/ui/input';
import { paisDesdeNavegador } from '@/lib/utils/paisNavegador';
import { cn } from '@/utils/Utils';

export interface Ubicacion {
  /** ISO alfa-3 (`countries.code`). */
  paisCodigo: string;
  paisNombre: string;
  ciudad: string;
  departamento: string;
  /** Código DANE del departamento (2 dígitos) cuando hay municipio. */
  departamentoCodigo: string;
  municipioId: string;
}

export const UBICACION_VACIA: Ubicacion = {
  paisCodigo: '',
  paisNombre: '',
  ciudad: '',
  departamento: '',
  departamentoCodigo: '',
  municipioId: '',
};

interface Municipio {
  id: string;
  name: string;
  code: string;
  state_name: string;
}

export interface CampoUbicacionProps {
  valor: Ubicacion;
  onCambio: (u: Ubicacion) => void;
  errorPais?: string | null;
  errorCiudad?: string | null;
  /** Ciudad obligatoria (por defecto no: se completa después desde Inicio). */
  ciudadObligatoria?: boolean;
  /** Prellenar el país desde el navegador si viene vacío (por defecto sí). */
  prellenar?: boolean;
  className?: string;
}

const CLASE_SELECT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger';

export function CampoUbicacion({
  valor,
  onCambio,
  errorPais,
  errorCiudad,
  ciudadObligatoria,
  prellenar = true,
  className,
}: CampoUbicacionProps) {
  const t = useTranslations('acceso.ubicacion');
  const [paises, setPaises] = React.useState<{ code: string; name: string }[]>([]);
  const [municipios, setMunicipios] = React.useState<Municipio[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [deducido, setDeducido] = React.useState(false);
  const valorRef = React.useRef(valor);
  valorRef.current = valor;

  React.useEffect(() => {
    let vivo = true;
    supabase
      .from('countries')
      .select('code, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (!vivo) return;
        const lista = (data ?? []) as { code: string; name: string }[];
        setPaises(lista);
        if (prellenar && !valorRef.current.paisCodigo) {
          const codigo = paisDesdeNavegador(lista.map((p) => p.code));
          const pais = lista.find((p) => p.code === codigo);
          if (pais) {
            setDeducido(true);
            onCambio({ ...valorRef.current, paisCodigo: pais.code, paisNombre: pais.name });
          }
        }
      });
    return () => {
      vivo = false;
    };
    // Una vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!valor.paisCodigo) {
      setMunicipios([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    supabase
      .from('municipalities')
      .select('id, name, code, state_name')
      .eq('country_code', valor.paisCodigo)
      .order('name')
      .limit(2000)
      .then(({ data }) => {
        if (!vivo) return;
        setMunicipios((data ?? []) as Municipio[]);
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [valor.paisCodigo]);

  const opciones = React.useMemo(
    () => municipios.map((m) => ({ value: m.id, label: m.name, sublabel: m.state_name })),
    [municipios],
  );

  const cambiarPais = (codigo: string) => {
    const pais = paises.find((p) => p.code === codigo);
    setDeducido(false);
    onCambio({ ...UBICACION_VACIA, paisCodigo: codigo, paisNombre: pais?.name ?? '' });
  };

  const elegirMunicipio = (id: string) => {
    const m = municipios.find((x) => x.id === id);
    if (!m) return;
    onCambio({
      ...valor,
      municipioId: m.id,
      ciudad: m.name,
      departamento: m.state_name,
      departamentoCodigo: m.code?.substring(0, 2) ?? '',
    });
  };

  const conMunicipios = municipios.length > 0;

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>
      <FormField etiqueta={t('pais')} obligatorio error={errorPais} ayuda={deducido ? t('paisDeducido') : undefined}>
        {(campo) => (
          <select
            id={campo.id}
            aria-describedby={campo['aria-describedby']}
            aria-invalid={campo['aria-invalid']}
            aria-required
            value={valor.paisCodigo}
            onChange={(e) => cambiarPais(e.target.value)}
            className={CLASE_SELECT}
            autoComplete="country"
          >
            <option value="">{t('elegirPais')}</option>
            {paises.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </FormField>

      {conMunicipios || cargando ? (
        <FormField
          etiqueta={t('ciudad')}
          obligatorio={ciudadObligatoria}
          error={errorCiudad}
          ayuda={valor.departamento ? t('departamentoDe', { departamento: valor.departamento }) : t('ciudadAyuda')}
        >
          {(campo) => (
            <SearchSelect
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              options={opciones}
              value={valor.municipioId}
              onValueChange={elegirMunicipio}
              placeholder={cargando ? t('cargando') : t('buscarCiudad')}
              searchPlaceholder={t('buscarCiudad')}
              emptyText={t('sinCiudades')}
              disabled={cargando || !valor.paisCodigo}
              className="rounded-lg border-line-strong bg-surface text-fg"
            />
          )}
        </FormField>
      ) : (
        <FormField etiqueta={t('ciudad')} obligatorio={ciudadObligatoria} error={errorCiudad}>
          <Input
            value={valor.ciudad}
            onChange={(e) => onCambio({ ...valor, ciudad: e.target.value, municipioId: '' })}
            autoComplete="address-level2"
            disabled={!valor.paisCodigo}
            className="h-10 rounded-lg"
          />
        </FormField>
      )}

      {!conMunicipios && !cargando && valor.paisCodigo && (
        <FormField etiqueta={t('estado')} className="sm:col-span-2">
          <Input
            value={valor.departamento}
            onChange={(e) => onCambio({ ...valor, departamento: e.target.value, departamentoCodigo: '' })}
            autoComplete="address-level1"
            className="h-10 rounded-lg"
          />
        </FormField>
      )}
    </div>
  );
}

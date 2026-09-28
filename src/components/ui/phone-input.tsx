'use client';

/**
 * Campo de teléfono ÚNICO de la aplicación: selector de país con bandera SVG +
 * número con formato del país mientras se escribe + validación de longitud.
 *
 * - Guarda `"+57 3001234567"` (el formato que ya había en la base; ver
 *   `@/lib/utils/telefono`). Lee también los valores viejos sin indicativo.
 * - Banderas SVG de `country-flag-icons` (los emoji de bandera no se ven en
 *   Windows: salían las letras). Se cargan en un chunk aparte la primera vez.
 * - País por defecto: `defaultIso` → país de la organización activa → Colombia.
 * - Validación: `esTelefonoValido` / `mensajeErrorTelefono` de
 *   `@/lib/utils/telefono`, que son las mismas que usan los formularios.
 */

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getCountryByIso, type CountryPhoneCode } from '@/lib/data/countryPhoneCodes';
import {
  DEFAULT_COUNTRY_ISO,
  buscarPaises,
  ejemploNacional,
  excedeLongitud,
  formatearNacional,
  formatearParaGuardar,
  indicativoDe,
  mensajeErrorTelefono,
  paisIsoDeOrganizacion,
  paisesTelefono,
  parsearTelefono,
} from '@/lib/utils/telefono';

export {
  esTelefonoValido,
  telefonoOpcionalValido,
  mensajeErrorTelefono,
  normalizarTelefono,
  formatearTelefono,
  aE164,
} from '@/lib/utils/telefono';

// ---------------------------------------------------------------------------
// Banderas
// ---------------------------------------------------------------------------

type ComponenteBandera = (props: React.SVGAttributes<SVGElement> & { title?: string }) => React.JSX.Element;
type ModuloBanderas = Record<string, ComponenteBandera | undefined>;

let banderasCargadas: ModuloBanderas | null = null;
let promesaBanderas: Promise<ModuloBanderas> | null = null;

function cargarBanderas(): Promise<ModuloBanderas> {
  if (!promesaBanderas) {
    promesaBanderas = import('country-flag-icons/react/3x2').then((m) => {
      banderasCargadas = m as unknown as ModuloBanderas;
      return banderasCargadas;
    });
  }
  return promesaBanderas;
}

function useBanderas(): ModuloBanderas | null {
  const [mod, setMod] = React.useState<ModuloBanderas | null>(banderasCargadas);
  React.useEffect(() => {
    if (mod) return;
    let vivo = true;
    cargarBanderas()
      .then((m) => vivo && setMod(m))
      .catch(() => {
        /* sin banderas se muestra el código ISO: el campo sigue funcionando */
      });
    return () => {
      vivo = false;
    };
  }, [mod]);
  return mod;
}

/** Bandera 3:2 del país (SVG). Mientras carga, o si no existe, muestra el ISO. */
export function BanderaPais({ iso, className }: { iso: string; className?: string }) {
  const banderas = useBanderas();
  const Bandera = banderas?.[iso.replace('-', '_')];
  const base = 'inline-block h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-line';
  if (!Bandera) {
    return (
      <span aria-hidden="true" className={cn(base, 'bg-subtle text-center text-[9px] font-semibold leading-[14px] text-fg-muted', className)}>
        {iso}
      </span>
    );
  }
  return <Bandera aria-hidden="true" focusable="false" className={cn(base, className)} />;
}

// ---------------------------------------------------------------------------
// País por defecto de la organización activa
// ---------------------------------------------------------------------------

const cachePaisOrg = new Map<number, Promise<string | null>>();

async function leerPaisOrganizacion(orgId: number): Promise<string | null> {
  const { supabase } = await import('@/lib/supabase/config');
  const { data } = await supabase
    .from('organizations')
    .select('country_code, country')
    .eq('id', orgId)
    .maybeSingle();
  return paisIsoDeOrganizacion(data?.country_code, data?.country);
}

/**
 * ISO del país de la organización activa, o `null` fuera de una organización
 * (registro, invitación) o si no se puede deducir. Una sola lectura por
 * organización y pestaña.
 */
export function usePaisTelefonoOrganizacion(activo = true): string | null {
  const [iso, setIso] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (!activo) return;
    const alCambiar = () => setVersion((v) => v + 1);
    window.addEventListener('organization-changed', alCambiar);
    return () => window.removeEventListener('organization-changed', alCambiar);
  }, [activo]);

  React.useEffect(() => {
    if (!activo) return;
    let vivo = true;
    (async () => {
      try {
        const { getOrganizationId } = await import('@/lib/hooks/useOrganization');
        const orgId = getOrganizationId();
        if (!orgId || orgId <= 0) return;
        let promesa = cachePaisOrg.get(orgId);
        if (!promesa) {
          promesa = leerPaisOrganizacion(orgId).catch(() => null);
          cachePaisOrg.set(orgId, promesa);
        }
        const valor = await promesa;
        if (vivo) setIso(valor);
      } catch {
        /* sin organización: se queda el país por defecto */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activo, version]);

  return iso;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export interface PhoneInputProps {
  /**
   * Valor completo del teléfono (ej: "+57 3001234567"). También acepta valores
   * viejos sin indicativo ("3001234567"), que se leen en el país por defecto.
   */
  value?: string | null;
  /** Se invoca con el valor listo para guardar ("+57 3001234567") o '' si está vacío. */
  onChange: (value: string) => void;
  /** Se invoca al salir del campo del número. */
  onBlur?: () => void;
  /** Placeholder del número. Por defecto, un ejemplo del país elegido. */
  placeholder?: string;
  /** Deshabilita todo el componente. */
  disabled?: boolean;
  /** Clase extra para el contenedor. */
  className?: string;
  /** Clase extra para el input del número. */
  inputClassName?: string;
  /** ID del input del número (para `<Label htmlFor>`). */
  id?: string;
  /** name del input del número (para forms nativos). */
  name?: string;
  /**
   * País a preseleccionar cuando el valor viene vacío o sin indicativo. Si no
   * se pasa, se usa el de la organización activa y, sin ella, Colombia.
   */
  defaultIso?: string;
  /** Requerido (atributo del input del número). */
  required?: boolean;
  /**
   * Error externo (p. ej. del formulario). `true` solo pinta el estado de error;
   * un texto además lo muestra debajo. Tiene prioridad sobre la validación interna.
   */
  error?: string | boolean;
  /**
   * Muestra el aviso de longitud del país al salir del campo. Desactívalo si el
   * formulario ya muestra su propio mensaje con `mensajeErrorTelefono`.
   */
  showValidation?: boolean;
  /** autocomplete del número. */
  autoComplete?: string;
  /** Texto de ayuda o error asociado al input. */
  'aria-describedby'?: string;
  /** Indica a tecnologías asistivas que el valor es inválido. */
  'aria-invalid'?: boolean;
  /** Nombre accesible del número cuando no hay `<Label htmlFor>`. */
  'aria-label'?: string;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  {
    value,
    onChange,
    onBlur,
    placeholder,
    disabled = false,
    className,
    inputClassName,
    id,
    name,
    defaultIso,
    required = false,
    error,
    showValidation = true,
    autoComplete = 'tel-national',
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? `telefono-${autoId}`;
  const listaId = `${inputId}-paises`;
  const mensajeId = `${inputId}-mensaje`;

  const paisOrg = usePaisTelefonoOrganizacion(!defaultIso);
  const isoPorDefecto = defaultIso ?? paisOrg ?? DEFAULT_COUNTRY_ISO;

  // País elegido a mano. Hace falta con el número vacío (no hay valor que lo
  // recuerde) y con indicativos compartidos: «+1 41…» a medio escribir puede
  // ser Canadá o EE. UU. hasta que el número está completo.
  const [isoManual, setIsoManual] = React.useState<string | null>(null);
  const parsed = React.useMemo(
    () => parsearTelefono(value ?? '', isoManual ?? isoPorDefecto),
    [value, isoManual, isoPorDefecto],
  );
  const isoSeleccionado = parsed?.iso ?? isoManual ?? isoPorDefecto;
  const pais: CountryPhoneCode =
    getCountryByIso(isoSeleccionado) ?? getCountryByIso(DEFAULT_COUNTRY_ISO) ?? paisesTelefono[0];
  const numero = parsed?.number ?? '';
  const textoNumero = formatearNacional(pais.iso, numero);

  const [open, setOpen] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const [activo, setActivo] = React.useState(0);
  const [tocado, setTocado] = React.useState(false);
  const busquedaRef = React.useRef<HTMLInputElement>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);
  const numeroRef = React.useRef<HTMLInputElement | null>(null);

  const setRefs = (el: HTMLInputElement | null) => {
    numeroRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };

  const filtrados = React.useMemo(() => buscarPaises(busqueda), [busqueda]);

  React.useEffect(() => {
    if (!open) {
      setBusqueda('');
      return;
    }
    const i = filtrados.findIndex((c) => c.iso === pais.iso);
    setActivo(i >= 0 ? i : 0);
    const t = setTimeout(() => busquedaRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // Solo al abrir: la búsqueda reinicia el activo en su propio efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (open) setActivo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  React.useEffect(() => {
    if (!open) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${activo}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activo, open]);

  const elegirPais = (c: CountryPhoneCode) => {
    setIsoManual(c.iso);
    // El número se conserva; si ya no cabe en el nuevo país, la validación lo avisa.
    onChange(formatearParaGuardar(c.iso, numero));
    setOpen(false);
    setTimeout(() => numeroRef.current?.focus(), 0);
  };

  const alEscribir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const texto = e.target.value;
    // Pegar un número internacional completo cambia de país.
    if (/^\s*(\+|00)/.test(texto)) {
      const p = parsearTelefono(texto, pais.iso);
      if (p) {
        setIsoManual(p.iso);
        onChange(formatearParaGuardar(p.iso, p.number));
        return;
      }
    }
    let digitos = texto.replace(/\D/g, '');
    // Borrar un separador («)» o «-») no borra nada: se lleva el dígito anterior.
    if (texto.length < textoNumero.length && digitos === numero) digitos = digitos.slice(0, -1);
    if (digitos.length > numero.length && excedeLongitud(pais.iso, digitos)) return;
    onChange(formatearParaGuardar(pais.iso, digitos));
  };

  const alTeclearBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const total = filtrados.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (total) setActivo((a) => (a + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (total) setActivo((a) => (a - 1 + total) % total);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (total) setActivo(total - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtrados[activo];
      if (c) elegirPais(c);
    }
  };

  const errorInterno = showValidation && tocado ? mensajeErrorTelefono(value ?? '', isoPorDefecto) : null;
  // `error === true`: el formulario pinta su propio mensaje; no se duplica.
  const textoError = typeof error === 'string' && error ? error : error ? null : errorInterno;
  const invalido = !!error || !!ariaInvalid || !!errorInterno;
  const describedBy = [ariaDescribedBy, textoError ? mensajeId : null].filter(Boolean).join(' ') || undefined;

  const bordeEstado = invalido ? 'border-line-danger' : 'border-line-strong';

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex w-full items-stretch rounded-md border bg-surface text-fg shadow-sm transition-colors',
          'focus-within:ring-1',
          invalido ? 'focus-within:ring-danger' : 'focus-within:ring-brand',
          bordeEstado,
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={`País del teléfono: ${pais.name} (${pais.dialCode}). Cambiar país`}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-l-md border-r px-2.5 text-sm outline-none transition-colors',
                bordeEstado,
                'hover:bg-hover focus-visible:bg-hover disabled:cursor-not-allowed',
              )}
            >
              <BanderaPais iso={pais.iso} />
              <span className="tabular-nums text-fg-secondary">{indicativoDe(pais.iso) || pais.dialCode}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[300px] border-line bg-surface p-0 text-fg"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center border-b border-line px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <input
                ref={busquedaRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={alTeclearBusqueda}
                placeholder="País, código ISO o indicativo"
                role="combobox"
                aria-label="Buscar país"
                aria-expanded="true"
                aria-controls={listaId}
                aria-autocomplete="list"
                aria-activedescendant={filtrados[activo] ? `${listaId}-${filtrados[activo].iso}` : undefined}
                className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
              />
            </div>
            <div
              ref={listaRef}
              id={listaId}
              role="listbox"
              aria-label="Países"
              className="max-h-[260px] overflow-y-auto overscroll-contain p-1"
            >
              {filtrados.length === 0 && (
                <div className="py-6 text-center text-sm text-fg-muted">No se encontraron países</div>
              )}
              {filtrados.map((c, i) => {
                const seleccionado = c.iso === pais.iso;
                return (
                  <div
                    key={c.iso}
                    id={`${listaId}-${c.iso}`}
                    role="option"
                    aria-selected={seleccionado}
                    data-indice={i}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => setActivo(i)}
                    onClick={() => elegirPais(c)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                      i === activo && 'bg-hover',
                      seleccionado && 'font-medium',
                    )}
                  >
                    <BanderaPais iso={c.iso} />
                    <span className="min-w-0 flex-1 truncate text-left">{c.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{c.dialCode}</span>
                    <Check
                      aria-hidden="true"
                      className={cn('h-4 w-4 shrink-0 text-brand', seleccionado ? 'opacity-100' : 'opacity-0')}
                    />
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <input
          ref={setRefs}
          id={inputId}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          value={textoNumero}
          onChange={alEscribir}
          onBlur={() => {
            setTocado(true);
            onBlur?.();
          }}
          placeholder={placeholder ?? ejemploNacional(pais.iso)}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-invalid={invalido || undefined}
          className={cn(
            'h-9 min-w-0 flex-1 rounded-r-md bg-transparent px-3 text-sm text-fg outline-none placeholder:text-fg-muted',
            'disabled:cursor-not-allowed',
            inputClassName,
          )}
        />
      </div>
      {textoError && (
        <p id={mensajeId} className="mt-1 text-xs text-danger-text" role={errorInterno && !error ? 'status' : undefined}>
          {textoError}
        </p>
      )}
    </div>
  );
});

export default PhoneInput;

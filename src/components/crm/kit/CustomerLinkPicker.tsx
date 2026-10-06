'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Info, Loader2, Search, UserPlus, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { FormField } from '@/components/kit/FormField';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_AVISO_INFO, CLASE_CAMPO } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import {
  datosCrear,
  debeBuscar,
  DEBOUNCE_MS,
  detalleFila,
  filaSiguiente,
  filtrarResultados,
  tipoSugerido,
  tiposDocumentoPara,
  validarCrear,
  valoresCrear,
  type ClienteVinculable,
  type FiltroCliente,
  type PasoVinculador,
  type TipoDocumento,
  type ValoresCrearCliente,
} from './customerLinkPickerLogica';

/**
 * Vinculador único de cliente (Figma `CustomerLinkPicker` 761:23596): lo
 * instancian `OpportunityForm`, el formulario de lead, la factura y la tarea
 * (`Filtro=Todos`, sin cargo), y la ficha al vincular persona ↔ empresa (con
 * el paso de cargo y contacto principal). La búsqueda la hace la pantalla
 * (`buscar`, contra `/api/crm/customers/search`, con la organización de la
 * sesión); el kit solo espera, pinta y elige. Diálogo en escritorio, hoja en
 * móvil. Pasos: buscar · sin resultados · cargando · crear · cargo.
 */
export interface CustomerLinkPickerProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  buscar: (texto: string) => Promise<ClienteVinculable[]>;
  onSeleccionar: (cliente: ClienteVinculable, vinculo?: { cargo: string | null; principal: boolean }) => void;
  /** Crear sin salir: devuelve el cliente creado. Sin permiso de crear, no se pasa. */
  onCrear?: (datos: ReturnType<typeof datosCrear>) => Promise<ClienteVinculable>;
  /** «Más datos» → formulario completo de cliente. */
  onMasDatos?: () => void;
  filtroInicial?: FiltroCliente;
  /** Oculta el selector de filtro (vincular contacto a empresa: solo Personas). */
  filtroFijo?: boolean;
  /** Nombre del cliente al que se vincula («Vincular contacto a …»). */
  vincularA?: string | null;
  /** Persona ↔ empresa: añade el paso de cargo y contacto principal. */
  conCargo?: boolean;
  /** Contacto principal actual de la empresa (aviso al marcar otro). */
  principalActual?: string | null;
  yaVinculados?: readonly string[];
  tiposDocumento?: readonly TipoDocumento[];
}

export function CustomerLinkPicker(props: CustomerLinkPickerProps) {
  const { abierto, onAbiertoChange, buscar, onSeleccionar, onCrear, filtroInicial = 'todos', vincularA, conCargo, yaVinculados = [] } = props;
  const t = useTranslations('crm.kit.vinculador');
  const [paso, setPaso] = useState<PasoVinculador>('buscar');
  const [filtro, setFiltro] = useState<FiltroCliente>(filtroInicial);
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<ClienteVinculable[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(0);
  const [elegido, setElegido] = useState<ClienteVinculable | null>(null);
  const [crear, setCrear] = useState<ValoresCrearCliente>(() => valoresCrear('', filtroInicial, props.tiposDocumento));
  const [cargo, setCargo] = useState('');
  const [principal, setPrincipal] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const turno = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    setPaso('buscar'); setFiltro(filtroInicial); setTexto(''); setFilas([]); setElegido(null); setError(null); setIntentado(false);
  }, [abierto, filtroInicial]);

  useEffect(() => {
    if (!abierto || !debeBuscar(texto)) { setFilas([]); setBuscando(false); return; }
    const mio = ++turno.current;
    setBuscando(true);
    const id = setTimeout(() => {
      buscar(texto.trim())
        .then((r) => { if (mio === turno.current) { setFilas(r); setError(null); setActivo(0); } })
        .catch(() => { if (mio === turno.current) setError(t('errorBuscar')); })
        .finally(() => { if (mio === turno.current) setBuscando(false); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [texto, abierto, buscar, t]);

  const visibles = filtrarResultados(filas, filtro);
  const deshabilitadas = visibles.map((c) => yaVinculados.includes(c.id));
  const tipoCrear = tipoSugerido(texto, filtro);
  const erroresCrear = validarCrear(crear);

  const elegir = (c: ClienteVinculable) => {
    if (yaVinculados.includes(c.id)) return;
    if (conCargo) { setElegido(c); setPaso('cargo'); return; }
    onSeleccionar(c);
  };
  const teclear = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && visibles[activo]) { e.preventDefault(); elegir(visibles[activo]); return; }
    const j = filaSiguiente(activo, e.key, deshabilitadas);
    if (j !== null) { e.preventDefault(); setActivo(j); }
  };
  const irACrear = () => { setCrear(valoresCrear(texto, filtro, props.tiposDocumento)); setIntentado(false); setPaso('crear'); };
  const guardarNuevo = async () => {
    setIntentado(true);
    if (!onCrear || Object.keys(erroresCrear).length) return;
    setOcupado(true);
    try {
      const nuevo = await onCrear(datosCrear(crear));
      elegir(nuevo);
    } catch {
      setError(t('errorCrear'));
    } finally {
      setOcupado(false);
    }
  };

  const titulo = paso === 'crear' ? t(crear.tipo === 'company' ? 'crearEmpresa' : 'crearPersona') : paso === 'cargo' ? t('cargoTitulo') : vincularA ? t(filtro === 'empresas' ? 'vincularEmpresa' : 'vincularContacto', { nombre: vincularA }) : t('titulo');
  const descripcion = paso === 'crear' ? t('crearAyuda') : paso === 'cargo' ? t('cargoAyuda') : t('ayuda');
  const errCrear = (k: keyof ValoresCrearCliente) => (intentado && erroresCrear[k] ? t(`error.${erroresCrear[k]}`) : null);

  const pie =
    paso === 'buscar' ? (
      <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
    ) : (
      <>
        <button type="button" onClick={() => setPaso('buscar')} disabled={ocupado} className={clasesBoton({ variante: 'fantasma' })}>{t('atras')}</button>
        {paso === 'crear' ? (
          <button type="button" onClick={guardarNuevo} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
            {ocupado && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {t('crearYContinuar')}
          </button>
        ) : (
          <button type="button" onClick={() => elegido && onSeleccionar(elegido, { cargo: cargo.trim() || null, principal })} className={clasesBoton()}>{t('vincular')}</button>
        )}
      </>
    );

  return (
    <PanelAdaptable abierto={abierto} onAbiertoChange={onAbiertoChange} titulo={titulo} descripcion={descripcion} ancho={520} ocupado={ocupado} pie={pie}>
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {paso === 'buscar' && (
        <>
          {!props.filtroFijo && (
            <SegmentedControl<FiltroCliente>
              etiqueta={t('filtro')}
              tamano="sm"
              opciones={(['todos', 'personas', 'empresas'] as const).map((f) => ({ valor: f, etiqueta: t(`filtros.${f}`) }))}
              valor={filtro}
              onValorChange={setFiltro}
            />
          )}
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              role="combobox"
              aria-expanded={visibles.length > 0}
              aria-controls="crm-vinculador-lista"
              aria-activedescendant={visibles[activo] ? `crm-vinc-${visibles[activo].id}` : undefined}
              aria-label={t('buscar')}
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={teclear}
              placeholder={t('buscar')}
              className={cn(CLASE_CAMPO, 'pl-9 pr-9')}
            />
            {texto && (
              <button type="button" aria-label={t('limpiar')} onClick={() => setTexto('')} className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-muted hover:text-fg">
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          {buscando ? (
            <div aria-busy="true" aria-label={t('buscando')} className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-subtle" />)}
            </div>
          ) : (
            debeBuscar(texto) && (
              <>
                <p aria-live="polite" className="text-xs text-fg-muted">{visibles.length ? t(`resultados.${filtro}`, { n: visibles.length }) : t('sinResultados', { texto: texto.trim() })}</p>
                <ul id="crm-vinculador-lista" role="listbox" aria-label={t('titulo')} className="flex flex-col gap-1">
                  {visibles.map((c, i) => {
                    const ya = deshabilitadas[i];
                    const nombre = c.full_name?.trim() || t('sinNombre');
                    return (
                      <li
                        key={c.id}
                        id={`crm-vinc-${c.id}`}
                        role="option"
                        aria-selected={i === activo}
                        aria-disabled={ya || undefined}
                        onClick={() => elegir(c)}
                        onMouseEnter={() => !ya && setActivo(i)}
                        className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === activo && !ya && 'bg-brand-tint', ya && 'cursor-not-allowed opacity-50')}
                      >
                        <AvatarIniciales nombre={nombre} src={c.avatar_url} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-fg">{nombre}</span>
                          <span className="truncate text-xs text-fg-muted">{detalleFila(c)}</span>
                        </span>
                        {ya ? (
                          <Badge tono="neutro" tamano="sm">{t('yaVinculada')}</Badge>
                        ) : (
                          <Badge tono={c.customer_type === 'company' ? 'informacion' : 'neutro'} apariencia={c.customer_type === 'company' ? 'contorno' : 'suave'} tamano="sm">
                            {t(c.customer_type === 'company' ? 'empresa' : 'persona')}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {onCrear && (
                  <button type="button" onClick={irACrear} className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-left text-sm font-medium text-brand-deep hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t(tipoCrear === 'company' ? 'crearEmpresaSinSalir' : 'crearPersonaSinSalir', { texto: texto.trim() })}
                  </button>
                )}
              </>
            )
          )}
        </>
      )}
      {paso === 'crear' && (
        <>
          <SegmentedControl<'person' | 'company'>
            etiqueta={t('tipo')}
            tamano="sm"
            opciones={[{ valor: 'person', etiqueta: t('persona') }, { valor: 'company', etiqueta: t('empresa') }]}
            valor={crear.tipo}
            onValorChange={(tipo) => setCrear((c) => ({ ...c, tipo, identification_type: tiposDocumentoPara(props.tiposDocumento ?? [], tipo)[0]?.code ?? '' }))}
          />
          {crear.tipo === 'person' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField etiqueta={t('nombres')} obligatorio error={errCrear('first_name')}><input value={crear.first_name} onChange={(e) => setCrear((c) => ({ ...c, first_name: e.target.value }))} className={CLASE_CAMPO} /></FormField>
              <FormField etiqueta={t('apellidos')} obligatorio error={errCrear('last_name')}><input value={crear.last_name} onChange={(e) => setCrear((c) => ({ ...c, last_name: e.target.value }))} className={CLASE_CAMPO} /></FormField>
            </div>
          ) : (
            <FormField etiqueta={t('razonSocial')} obligatorio error={errCrear('company_name')}><input value={crear.company_name} onChange={(e) => setCrear((c) => ({ ...c, company_name: e.target.value }))} className={CLASE_CAMPO} /></FormField>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('tipoDocumento')}>
              <SelectCrm valor={crear.identification_type} onValorChange={(identification_type) => setCrear((c) => ({ ...c, identification_type }))} opcionVacia={t('elegir')} opciones={tiposDocumentoPara(props.tiposDocumento ?? [], crear.tipo).map((d) => ({ valor: d.code, etiqueta: d.name }))} />
            </FormField>
            <FormField etiqueta={t('numero')}><input value={crear.identification_number} onChange={(e) => setCrear((c) => ({ ...c, identification_number: e.target.value }))} className={CLASE_CAMPO} /></FormField>
          </div>
          <FormField etiqueta={t('correo')} error={errCrear('email')}><input type="email" value={crear.email} onChange={(e) => setCrear((c) => ({ ...c, email: e.target.value }))} className={CLASE_CAMPO} /></FormField>
          <FormField etiqueta={t('telefono')}>{(c) => <PhoneInput id={c.id} tamano="md" value={crear.phone} onChange={(v) => setCrear((x) => ({ ...x, phone: v }))} aria-describedby={c['aria-describedby']} />}</FormField>
          {props.onMasDatos && (
            <button type="button" onClick={props.onMasDatos} className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-brand-deep hover:underline">
              {t('masDatos')}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </>
      )}
      {paso === 'cargo' && elegido && (
        <>
          <div className="flex items-center gap-3 rounded-lg bg-subtle p-3">
            <AvatarIniciales nombre={elegido.full_name || ''} src={elegido.avatar_url} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-fg">{elegido.full_name}</span>
              {vincularA && <span className="truncate text-xs text-fg-secondary">→ {vincularA}</span>}
            </span>
          </div>
          <FormField etiqueta={t('cargo')}><input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={100} className={CLASE_CAMPO} /></FormField>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} className="size-4 rounded border-line-strong accent-brand-action" />
            {t('principal')}
          </label>
          {principal && props.principalActual && (
            <p className={CLASE_AVISO_INFO}>
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {t('avisoPrincipal', { nombre: props.principalActual })}
            </p>
          )}
        </>
      )}
    </PanelAdaptable>
  );
}

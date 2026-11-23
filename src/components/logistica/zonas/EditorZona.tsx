'use client';

/**
 * Editor de una zona de domicilio (Figma 2793:801): cobertura (barrios, municipios DANE y
 * códigos postales), datos de la zona, tarifa y promesa, y estado.
 *
 * Polígono en el mapa: pendiente. El repo tiene Leaflet para ver mapas, pero no una herramienta
 * de dibujo (leaflet-draw o similar sería una librería nueva); la base ya acepta GeoJSON
 * (`location_type = 'polygon'`) y la cotización lo respeta. Mientras tanto, la cobertura se arma
 * con barrios, municipios DANE y códigos postales; los polígonos que ya existan se muestran y se
 * pueden quitar.
 *
 * Guarda con `zonasEnvioService` (validación en `zonas.ts`); los cambios de cobertura se aplican al
 * guardar (se agregan las nuevas y se quitan las retiradas).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, MapPin, Plus, X } from 'lucide-react';
import {
  AvisoTonal,
  CampoNumero,
  ChipsOpcion,
  FormField,
  PageHeader,
  SegmentedControl,
  Tarjeta,
  clasesBoton,
  type OpcionChip,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import {
  actualizarZona,
  agregarUbicaciones,
  crearZona,
  eliminarUbicacion,
  ZonaEnvioError,
  type ZonaConUbicaciones,
} from '@/lib/services/logistica/zonasEnvioService';
import {
  prepararUbicacion,
  validarZona,
  type AplicaEnvioGratis,
  type TipoUbicacion,
  type UbicacionZonaEntrada,
  type ZonaEnvioEntrada,
} from '@/lib/logistica/zonas';
import { etiquetaUbicacion, normalizarTexto } from '@/lib/logistica/presentacionEnvio';
import { normalizarAjustesLogistica } from '@/lib/logistica/ajustesLogistica';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface Props {
  organizationId: number;
  zona: ZonaConUbicaciones | null;
  sedeInicial: number | null;
  onCerrar: (guardo: boolean) => void;
}

type TipoEditable = Exclude<TipoUbicacion, 'polygon'>;
const TIPOS_EDITABLES: readonly TipoEditable[] = ['neighborhood', 'municipality', 'postal_code'];
const DIAS = ['1', '2', '3', '4', '5', '6', '7'] as const;

interface UbicacionLocal extends UbicacionZonaEntrada {
  /** id de la base; sin id = nueva. */
  id?: string;
  clave: string;
}

function claveDe(u: UbicacionZonaEntrada): string {
  return `${u.location_type}:${normalizarTexto(u.neighborhood ?? u.postal_code ?? '')}:${u.municipality_code ?? ''}`;
}

export function EditorZona({ organizationId, zona, sedeInicial, onCerrar }: Props) {
  const t = useTranslations('logistica.zonas.editor');
  const tz = useTranslations('logistica.zonas');
  const { toast } = useToast();
  const { branches } = useBranch();

  const [form, setForm] = useState<ZonaEnvioEntrada>(() => ({
    name: zona?.name ?? '',
    description: zona?.description ?? null,
    branch_id: zona ? zona.branch_id : sedeInicial,
    priority: zona?.priority ?? 100,
    is_active: zona?.is_active ?? true,
    is_fallback: zona?.is_fallback ?? false,
    fee: zona ? Number(zona.fee) : 0,
    promise_min_minutes: zona?.promise_min_minutes ?? null,
    promise_max_minutes: zona?.promise_max_minutes ?? null,
    promise_text: zona?.promise_text ?? null,
    min_order_amount: zona ? Number(zona.min_order_amount) : 0,
    free_shipping_from: zona?.free_shipping_from != null ? Number(zona.free_shipping_from) : null,
    free_shipping_applies_to: zona?.free_shipping_applies_to ?? 'web',
    cutoff_time: zona?.cutoff_time ? zona.cutoff_time.slice(0, 5) : null,
    delivery_days: zona?.delivery_days ?? [1, 2, 3, 4, 5, 6, 7],
  }));
  const [ubicaciones, setUbicaciones] = useState<UbicacionLocal[]>(() =>
    (zona?.ubicaciones ?? []).map((u) => ({ ...u, id: u.id, clave: `db:${u.id}` })),
  );
  const [tipo, setTipo] = useState<TipoEditable>('neighborhood');
  const [nuevo, setNuevo] = useState({ valor: '', municipio: '', etiqueta: '' });
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Zona nueva: «Envío gratis aplica en» nace con el valor de Configuración › Logística.
  useEffect(() => {
    if (zona) return;
    let vigente = true;
    const org = getOrganizationId();
    fetch('/api/logistica/ajustes', { credentials: 'same-origin', cache: 'no-store', headers: org > 0 ? { 'x-organization-id': String(org) } : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente || !d) return;
        const porDefecto = normalizarAjustesLogistica(d.ajustes).envioGratisPorDefecto;
        setForm((f) => ({ ...f, free_shipping_applies_to: porDefecto }));
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [zona]);

  const cambiar = <K extends keyof ZonaEnvioEntrada>(campo: K, valor: ZonaEnvioEntrada[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const opcionesTipo = TIPOS_EDITABLES.map((v) => ({ valor: v, etiqueta: t(`tipos.${v}`) }));
  const opcionesDias: OpcionChip<(typeof DIAS)[number]>[] = DIAS.map((d) => ({ valor: d, etiqueta: t(`dias.${d}`) }));
  const opcionesGratis: { valor: AplicaEnvioGratis; etiqueta: string }[] = (['web', 'pos', 'both'] as const).map((v) => ({ valor: v, etiqueta: tz(`gratisAplica.${v}`) }));
  const poligonos = ubicaciones.filter((u) => u.location_type === 'polygon');
  const delTipo = useMemo(() => ubicaciones.filter((u) => u.location_type === tipo), [ubicaciones, tipo]);

  const agregar = async () => {
    setErrorUbicacion(null);
    let entrada: UbicacionZonaEntrada;
    if (tipo === 'neighborhood') {
      entrada = { location_type: 'neighborhood', neighborhood: nuevo.valor, municipality_code: nuevo.municipio || null, label: nuevo.etiqueta || null };
    } else if (tipo === 'postal_code') {
      entrada = { location_type: 'postal_code', postal_code: nuevo.valor, label: nuevo.etiqueta || null };
    } else {
      entrada = { location_type: 'municipality', municipality_code: nuevo.valor, label: nuevo.etiqueta || null };
    }
    const r = prepararUbicacion(entrada);
    if (!r.ok) {
      setErrorUbicacion(t(`errorUbicacion.${r.error}`));
      return;
    }
    let fila = r.fila;
    // Municipio: el nombre del catálogo como etiqueta («25754 Soacha»).
    if (fila.location_type === 'municipality' && !fila.label && fila.municipality_code) {
      const { data } = await supabase.from('municipalities').select('name').eq('code', fila.municipality_code).limit(1).maybeSingle();
      if (data?.name) fila = { ...fila, label: String(data.name) };
    }
    const clave = claveDe(fila);
    if (ubicaciones.some((u) => claveDe(u) === clave)) {
      setErrorUbicacion(t('errorUbicacion.repetida'));
      return;
    }
    setUbicaciones((l) => [...l, { ...fila, clave: `nueva:${clave}` }]);
    setNuevo({ valor: '', municipio: '', etiqueta: '' });
  };

  const guardar = async () => {
    const entrada: ZonaEnvioEntrada = {
      ...form,
      name: form.name.trim(),
      promise_text: form.promise_text?.trim() || null,
      cutoff_time: form.cutoff_time || null,
    };
    const errs = validarZona(entrada);
    setErrores(errs);
    if (errs.length > 0) return;
    setGuardando(true);
    try {
      const guardada = zona ? await actualizarZona(supabase, organizationId, zona.id, entrada) : await crearZona(supabase, organizationId, entrada);
      const originales = new Set((zona?.ubicaciones ?? []).map((u) => u.id));
      const quedan = new Set(ubicaciones.filter((u) => u.id).map((u) => u.id as string));
      for (const id of originales) {
        if (!quedan.has(id)) await eliminarUbicacion(supabase, organizationId, id);
      }
      const nuevas = ubicaciones.filter((u) => !u.id).map(({ clave: _c, id: _i, ...u }) => { void _c; void _i; return u; });
      if (nuevas.length > 0) await agregarUbicaciones(supabase, organizationId, guardada.id, nuevas);
      toast({ title: tz('toast.guardada') });
      onCerrar(true);
    } catch (e) {
      console.error('[logistica] no se pudo guardar la zona', e);
      const codigo = e instanceof ZonaEnvioError ? e.codigo : null;
      toast({ title: codigo === 'zona_duplicada' ? t('errores.zona_duplicada') : tz('toast.error'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const errorDe = (codigo: string) => (errores.includes(codigo) ? t(`errores.${codigo}`) : null);

  return (
    <>
      <PageHeader
        variante="form"
        titulo={zona ? zona.name : t('nueva')}
        subtitulo={t('subtitulo')}
        migas={[{ etiqueta: tz('pagina.migaLogistica') }, { etiqueta: tz('titulo') }]}
        volverA="#"
        onVolver={() => onCerrar(false)}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => onCerrar(false)} disabled={guardando}>
              {t('cancelar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => void guardar()} disabled={guardando}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('guardar')}
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Tarjeta titulo={t('cobertura')} icono={MapPin}>
          <div className="flex flex-col gap-4">
            <SegmentedControl opciones={opcionesTipo} valor={tipo} onValorChange={setTipo} etiqueta={t('cobertura')} />
            <AvisoTonal tono="informacion" compacto titulo={t('poligonoPendiente.titulo')} descripcion={t('poligonoPendiente.descripcion')} />

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormField etiqueta={t(`campo.${tipo}`)}>
                <Input
                  value={nuevo.valor}
                  inputMode={tipo === 'neighborhood' ? 'text' : 'numeric'}
                  placeholder={t(`placeholder.${tipo}`)}
                  onChange={(e) => setNuevo((n) => ({ ...n, valor: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void agregar();
                    }
                  }}
                />
              </FormField>
              {tipo === 'neighborhood' ? (
                <FormField etiqueta={t('municipioOpcional')}>
                  <Input value={nuevo.municipio} inputMode="numeric" placeholder={t('placeholder.municipality')} onChange={(e) => setNuevo((n) => ({ ...n, municipio: e.target.value }))} />
                </FormField>
              ) : (
                <FormField etiqueta={t('etiquetaOpcional')}>
                  <Input value={nuevo.etiqueta} onChange={(e) => setNuevo((n) => ({ ...n, etiqueta: e.target.value }))} />
                </FormField>
              )}
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => void agregar()}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('agregar')}
              </button>
            </div>
            {errorUbicacion && (
              <p role="alert" className="text-xs text-danger-text">
                {errorUbicacion}
              </p>
            )}

            {delTipo.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('sinUbicaciones')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label={t(`tipos.${tipo}`)}>
                {delTipo.map((u) => (
                  <li key={u.clave} className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm text-fg">
                    {etiquetaUbicacion({ location_type: u.location_type, label: u.label ?? null, neighborhood: u.neighborhood ?? null, municipality_code: u.municipality_code ?? null, postal_code: u.postal_code ?? null })}
                    {u.location_type === 'neighborhood' && u.municipality_code ? <span className="text-xs text-fg-muted">· {u.municipality_code}</span> : null}
                    <button
                      type="button"
                      aria-label={t('quitar', { nombre: u.neighborhood ?? u.postal_code ?? u.municipality_code ?? '' })}
                      className="flex size-6 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg"
                      onClick={() => setUbicaciones((l) => l.filter((x) => x.clave !== u.clave))}
                    >
                      <X aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {poligonos.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <p className="text-sm font-medium text-fg">{t('tipos.polygon')}</p>
                <ul className="flex flex-wrap gap-2">
                  {poligonos.map((u) => (
                    <li key={u.clave} className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm text-fg">
                      {u.label || t('poligonoSinNombre')}
                      <button
                        type="button"
                        aria-label={t('quitar', { nombre: u.label || t('poligonoSinNombre') })}
                        className="flex size-6 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg"
                        onClick={() => setUbicaciones((l) => l.filter((x) => x.clave !== u.clave))}
                      >
                        <X aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-fg-secondary">{t('coberturaAyuda')}</p>
          </div>
        </Tarjeta>

        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('datos')}>
            <div className="flex flex-col gap-3">
              <FormField etiqueta={t('nombre')} obligatorio error={errorDe('nombre_requerido')}>
                <Input value={form.name} maxLength={120} onChange={(e) => cambiar('name', e.target.value)} />
              </FormField>
              <FormField etiqueta={t('sede')} ayuda={t('sedeAyuda')}>
                {(c) => (
                  <Select value={form.branch_id == null ? 'todas' : String(form.branch_id)} onValueChange={(v) => cambiar('branch_id', v === 'todas' ? null : Number(v))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{tz('todasLasSedes')}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('prioridad')} ayuda={t('prioridadAyuda')}>
                <CampoNumero valor={form.priority ?? 100} onValorChange={(v) => cambiar('priority', v ?? 100)} decimales={0} minimo={0} alinear="izquierda" />
              </FormField>
              <label className="flex items-start gap-3 text-sm text-fg">
                <Switch checked={!!form.is_fallback} onCheckedChange={(v) => cambiar('is_fallback', v)} aria-describedby="zona-general-ayuda" />
                <span>
                  {t('esGeneral')}
                  <span id="zona-general-ayuda" className="block text-xs text-fg-secondary">
                    {t('esGeneralAyuda')}
                  </span>
                </span>
              </label>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('tarifaPromesa')}>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('tarifa')} error={errorDe('tarifa_invalida')}>
                <CampoNumero valor={form.fee ?? 0} onValorChange={(v) => cambiar('fee', v ?? 0)} minimo={0} decimales={0} />
              </FormField>
              <FormField etiqueta={t('minimo')} error={errorDe('minimo_invalido')}>
                <CampoNumero valor={form.min_order_amount ?? 0} onValorChange={(v) => cambiar('min_order_amount', v ?? 0)} minimo={0} decimales={0} />
              </FormField>
              <FormField etiqueta={t('tiempoMin')} error={errorDe('promesa_invalida')}>
                <CampoNumero valor={form.promise_min_minutes} onValorChange={(v) => cambiar('promise_min_minutes', v)} minimo={0} decimales={0} sufijo="min" />
              </FormField>
              <FormField etiqueta={t('tiempoMax')}>
                <CampoNumero valor={form.promise_max_minutes} onValorChange={(v) => cambiar('promise_max_minutes', v)} minimo={0} decimales={0} sufijo="min" />
              </FormField>
              <div className="col-span-2">
                <FormField etiqueta={t('textoPromesa')} ayuda={t('textoPromesaAyuda')}>
                  <Input value={form.promise_text ?? ''} maxLength={60} placeholder={t('textoPromesaPlaceholder')} onChange={(e) => cambiar('promise_text', e.target.value)} />
                </FormField>
              </div>
              <div className="col-span-2">
                <FormField etiqueta={t('gratisDesde')} error={errorDe('envio_gratis_invalido')} ayuda={t('gratisDesdeAyuda')}>
                  <CampoNumero valor={form.free_shipping_from} onValorChange={(v) => cambiar('free_shipping_from', v && v > 0 ? v : null)} minimo={0} decimales={0} />
                </FormField>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span id="zona-gratis-aplica" className="text-sm font-medium text-fg">
                  {t('gratisAplica')}
                </span>
                <SegmentedControl
                  id="zona-gratis-aplica-control"
                  opciones={opcionesGratis}
                  valor={form.free_shipping_applies_to ?? 'web'}
                  onValorChange={(v) => cambiar('free_shipping_applies_to', v)}
                  etiqueta={t('gratisAplica')}
                  anchoCompleto
                />
                <p className="text-xs text-fg-secondary">{t('gratisAplicaAyuda')}</p>
              </div>
              <div className="col-span-2">
                <FormField etiqueta={t('corte')} ayuda={t('corteAyuda')} error={errorDe('corte_invalido')}>
                  <Input type="time" value={form.cutoff_time ?? ''} onChange={(e) => cambiar('cutoff_time', e.target.value || null)} />
                </FormField>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-sm font-medium text-fg">{t('diasReparto')}</span>
                <ChipsOpcion
                  multiple
                  opciones={opcionesDias}
                  valor={(form.delivery_days ?? []).map(String) as (typeof DIAS)[number][]}
                  onValorChange={(v) => cambiar('delivery_days', v.map(Number).sort((a, b) => a - b))}
                  etiqueta={t('diasReparto')}
                />
                {errorDe('dias_invalidos') && (
                  <p role="alert" className="text-xs text-danger-text">
                    {errorDe('dias_invalidos')}
                  </p>
                )}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('estado')}>
            <label className="flex items-start gap-3 text-sm text-fg">
              <Switch checked={!!form.is_active} onCheckedChange={(v) => cambiar('is_active', v)} aria-describedby="zona-activa-ayuda" />
              <span>
                {t('activa')}
                <span id="zona-activa-ayuda" className="block text-xs text-fg-secondary">
                  {t('activaAyuda')}
                </span>
              </span>
            </label>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

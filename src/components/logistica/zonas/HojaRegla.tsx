'use client';

/**
 * Hoja lateral de una regla de despacho (Figma 2794:2281): nombre, prioridad, «Si se cumple todo
 * esto» (condiciones que se agregan y se quitan) y «Entonces lo entrega». Fase 1: solo
 * «Domicilio propio»; las demás salidas se muestran como próximas (Fase 2 y 3).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Plus, Trash2 } from 'lucide-react';
import { CampoNumero, ChipsOpcion, FormField, StatusBadge, clasesBoton, type OpcionChip } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { supabase } from '@/lib/supabase/config';
import { actualizarRegla, crearRegla, type ZonaConUbicaciones } from '@/lib/services/logistica/zonasEnvioService';
import type { ReglaDespacho, ReglaDespachoEntrada } from '@/lib/logistica/zonas';
import { CANALES_COTIZACION } from '@/lib/logistica/cotizacion';
import { CAMPOS_CONDICION, camposConCondicion, vaciarCondicion, type CampoCondicion } from './reglasPresentacion';
import type { MetodoPagoOpcion } from './ReglasDespacho';

interface Props {
  abierta: boolean;
  onAbiertaChange: (v: boolean) => void;
  organizationId: number;
  regla: ReglaDespacho | null;
  total: number;
  zonas: readonly ZonaConUbicaciones[];
  metodos: readonly MetodoPagoOpcion[];
  onGuardada: () => void;
  onProbar: () => void;
}

const DIAS = ['1', '2', '3', '4', '5', '6', '7'] as const;
const SALIDAS_FUTURAS = ['tercero', 'fija', 'barata', 'rapida'] as const;

function vacia(): ReglaDespachoEntrada {
  return {
    name: '',
    is_active: true,
    priority: 100,
    branch_id: null,
    zone_ids: null,
    channels: null,
    payment_methods: null,
    min_order_value: null,
    max_order_value: null,
    min_weight_kg: null,
    max_weight_kg: null,
    weekdays: null,
    time_from: null,
    time_to: null,
    action: 'own',
  };
}

export function HojaRegla({ abierta, onAbiertaChange, organizationId, regla, total, zonas, metodos, onGuardada, onProbar }: Props) {
  const t = useTranslations('logistica.reglas');
  const th = useTranslations('logistica.reglas.hoja');
  const { toast } = useToast();
  const { branches } = useBranch();
  const [form, setForm] = useState<ReglaDespachoEntrada>(vacia);
  const [campos, setCampos] = useState<CampoCondicion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta) return;
    const base = regla ? { ...vacia(), ...regla } : { ...vacia(), priority: (total + 1) * 10 };
    setForm(base);
    setCampos(camposConCondicion(base));
    setError(null);
  }, [abierta, regla, total]);

  const cambiar = (c: Partial<ReglaDespachoEntrada>) => setForm((f) => ({ ...f, ...c }));
  const libres = CAMPOS_CONDICION.filter((c) => !campos.includes(c));

  const quitar = (campo: CampoCondicion) => {
    setCampos((l) => l.filter((c) => c !== campo));
    cambiar(vaciarCondicion(campo));
  };
  const reemplazar = (viejo: CampoCondicion, nuevo: CampoCondicion) => {
    setCampos((l) => l.map((c) => (c === viejo ? nuevo : c)));
    cambiar(vaciarCondicion(viejo));
  };

  const guardar = async () => {
    if (!form.name.trim()) {
      setError(th('errorNombre'));
      return;
    }
    setGuardando(true);
    try {
      const entrada: ReglaDespachoEntrada = { ...form, name: form.name.trim(), action: 'own' };
      if (regla) {
        const { id: _i, organization_id: _o, created_at: _c, updated_at: _u, ...cambios } = entrada as ReglaDespacho;
        void _i; void _o; void _c; void _u;
        await actualizarRegla(supabase, organizationId, regla.id, cambios);
      } else {
        await crearRegla(supabase, organizationId, entrada);
      }
      toast({ title: t('toast.guardada') });
      onGuardada();
    } catch (e) {
      console.error('[logistica] no se pudo guardar la regla', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const opcionesZona: OpcionChip<string>[] = zonas.map((z) => ({ valor: z.id, etiqueta: z.name }));
  const opcionesCanal: OpcionChip<string>[] = CANALES_COTIZACION.map((c) => ({ valor: c, etiqueta: t(`canales.${c}`) }));
  const opcionesMetodo: OpcionChip<string>[] = metodos.map((m) => ({ valor: m.codigo, etiqueta: m.nombre }));
  const opcionesDias: OpcionChip<string>[] = DIAS.map((d) => ({ valor: d, etiqueta: t(`dias.${d}`) }));

  const editorValor = (campo: CampoCondicion) => {
    switch (campo) {
      case 'zona':
        return opcionesZona.length > 0 ? (
          <ChipsOpcion multiple opciones={opcionesZona} valor={form.zone_ids ?? []} onValorChange={(v) => cambiar({ zone_ids: v.length ? v : null })} etiqueta={th('campos.zona')} />
        ) : (
          <p className="text-xs text-fg-secondary">{th('sinZonas')}</p>
        );
      case 'canal':
        return (
          <ChipsOpcion
            multiple
            opciones={opcionesCanal}
            valor={form.channels ?? []}
            onValorChange={(v) => cambiar({ channels: v.length ? (v as ReglaDespacho['channels']) : null })}
            etiqueta={th('campos.canal')}
          />
        );
      case 'metodo_pago':
        return (
          <ChipsOpcion multiple opciones={opcionesMetodo} valor={form.payment_methods ?? []} onValorChange={(v) => cambiar({ payment_methods: v.length ? v : null })} etiqueta={th('campos.metodo_pago')} />
        );
      case 'valor':
        return (
          <div className="grid grid-cols-2 gap-2">
            <CampoNumero aria-label={th('desde')} placeholder={th('desde')} valor={form.min_order_value ?? null} onValorChange={(v) => cambiar({ min_order_value: v })} minimo={0} decimales={0} />
            <CampoNumero aria-label={th('hasta')} placeholder={th('hasta')} valor={form.max_order_value ?? null} onValorChange={(v) => cambiar({ max_order_value: v })} minimo={0} decimales={0} />
          </div>
        );
      case 'peso':
        return (
          <div className="grid grid-cols-2 gap-2">
            <CampoNumero aria-label={th('desde')} placeholder={th('desde')} valor={form.min_weight_kg ?? null} onValorChange={(v) => cambiar({ min_weight_kg: v })} minimo={0} decimales={2} sufijo="kg" />
            <CampoNumero aria-label={th('hasta')} placeholder={th('hasta')} valor={form.max_weight_kg ?? null} onValorChange={(v) => cambiar({ max_weight_kg: v })} minimo={0} decimales={2} sufijo="kg" />
          </div>
        );
      case 'dias':
        return (
          <ChipsOpcion
            multiple
            opciones={opcionesDias}
            valor={(form.weekdays ?? []).map(String)}
            onValorChange={(v) => cambiar({ weekdays: v.length ? v.map(Number).sort((a, b) => a - b) : null })}
            etiqueta={th('campos.dias')}
          />
        );
      case 'horario':
        return (
          <div className="grid grid-cols-2 gap-2">
            <Input type="time" aria-label={th('desde')} value={form.time_from?.slice(0, 5) ?? ''} onChange={(e) => cambiar({ time_from: e.target.value || null })} />
            <Input type="time" aria-label={th('hasta')} value={form.time_to?.slice(0, 5) ?? ''} onChange={(e) => cambiar({ time_to: e.target.value || null })} />
          </div>
        );
    }
  };

  return (
    <HojaDetalle
      abierto={abierta}
      onAbiertoChange={onAbiertaChange}
      titulo={regla ? th('tituloEditar', { orden: regla.priority, nombre: regla.name }) : th('tituloNueva')}
      subtitulo={th('subtitulo', { total })}
      ancho={560}
      ocupado={guardando}
      pie={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={onProbar}>
            <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('probar')}
          </button>
          <div className="flex gap-2">
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'md' })} onClick={() => onAbiertaChange(false)}>
              {th('cancelar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => void guardar()} disabled={guardando}>
              {th('guardar')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <FormField etiqueta={th('nombre')} obligatorio error={error}>
            <Input value={form.name} maxLength={120} onChange={(e) => cambiar({ name: e.target.value })} />
          </FormField>
          <FormField etiqueta={th('prioridad')}>
            <CampoNumero valor={form.priority ?? 100} onValorChange={(v) => cambiar({ priority: v ?? 100 })} minimo={0} decimales={0} alinear="izquierda" />
          </FormField>
        </div>
        <FormField etiqueta={th('sede')}>
          {(c) => (
            <Select value={form.branch_id == null ? 'todas' : String(form.branch_id)} onValueChange={(v) => cambiar({ branch_id: v === 'todas' ? null : Number(v) })}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{t('todasLasSedes')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <section className="flex flex-col gap-3" aria-labelledby="regla-condiciones">
          <h3 id="regla-condiciones" className="text-base font-semibold text-fg">
            {th('siSeCumple')}
          </h3>
          {campos.length === 0 && <p className="text-sm text-fg-secondary">{th('sinCondiciones')}</p>}
          {campos.map((campo) => (
            <div key={campo} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <Select value={campo} onValueChange={(v) => reemplazar(campo, v as CampoCondicion)}>
                  <SelectTrigger className="h-9 w-48" aria-label={th('campo')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[campo, ...libres].map((c) => (
                      <SelectItem key={c} value={c}>
                        {th(`campos.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-fg-secondary">{th(`operador.${campo}`)}</span>
                <button
                  type="button"
                  className="ml-auto flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
                  aria-label={th('quitarCondicion', { campo: th(`campos.${campo}`) })}
                  onClick={() => quitar(campo)}
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
              {editorValor(campo)}
            </div>
          ))}
          {libres.length > 0 && (
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setCampos((l) => [...l, libres[0]])}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {th('agregarCondicion')}
            </button>
          )}
          <p className="text-xs text-fg-secondary">{th('camposAyuda')}</p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="regla-entonces">
          <h3 id="regla-entonces" className="text-base font-semibold text-fg">
            {th('entonces')}
          </h3>
          <div className="rounded-lg border border-line-brand bg-brand-tint p-3" role="radio" aria-checked="true">
            <p className="text-sm font-medium text-fg">{t('acciones.propio')}</p>
            <p className="text-xs text-fg-secondary">{th('propioAyuda')}</p>
          </div>
          {SALIDAS_FUTURAS.map((s) => (
            <div key={s} className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 opacity-70" role="radio" aria-checked="false" aria-disabled="true">
              <div>
                <p className="text-sm font-medium text-fg">{th(`salidas.${s}.titulo`)}</p>
                <p className="text-xs text-fg-secondary">{th(`salidas.${s}.ayuda`)}</p>
              </div>
              <StatusBadge estado="proximamente" etiqueta={th(`salidas.${s}.fase`)} tono="neutro" tamano="sm" />
            </div>
          ))}
        </section>
      </div>
    </HojaDetalle>
  );
}

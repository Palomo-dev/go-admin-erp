'use client';

/**
 * POS › Reservas de mesas › Configuración — contenedor (Figma 1699:864094).
 *
 * Lee y guarda `restaurant_booking_settings` de la sede por
 * `/api/pos/reservas-mesas/configuracion` (organización de la sesión, permiso
 * resuelto en el servidor; la validación es la de
 * `restaurantBookingSettingsService`, la misma que aplica la ruta). La vista
 * es `ConfiguracionVista`.
 *
 * - Sede sin fila → estado «vacío»: «Configurar con valores recomendados»
 *   (guarda `is_enabled = true` EXPLÍCITO y el horario de la sucursal) o
 *   «Copiar de <otra sede>».
 * - «Copiar a otra sede» guarda estos mismos ajustes en la sede elegida.
 * - Ctrl+S guarda; «Descartar» vuelve a lo guardado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Dialogo, FormField } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  contarCambiosAjustes,
  horarioDesdeSucursal,
  validarAjustesReserva,
  type AjustesReservaDto,
  type AjustesSede,
  type ErroresAjustes,
} from '@/lib/services/restaurantBookingSettingsService';
import { ConfiguracionVista, type EstadoConfig, type SedeConfig } from './ConfiguracionVista';

interface RespuestaConfiguracion {
  sede: AjustesSede;
  recomendados: AjustesReservaDto;
  porDefecto: AjustesReservaDto;
  zonas: string[];
  mesas?: { total: number; porZona: Record<string, number> };
  puedeEditar: boolean;
  pasarela?: string | null;
  horarioSucursal?: unknown;
  host?: string | null;
}

interface Props {
  /** Sede activa (`useBranch().branchFilter`); null = toda la organización. */
  branchId: number | null;
  sedes: readonly SedeConfig[];
  onSedeChange: (id: number) => void;
  onIrAgenda: () => void;
}

async function leer(branchId: number | null): Promise<RespuestaConfiguracion> {
  const qs = branchId != null ? `?branchId=${branchId}` : '';
  const res = await fetch(`/api/pos/reservas-mesas/configuracion${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as RespuestaConfiguracion;
}

async function escribir(branchId: number | null, ajustes: AjustesReservaDto) {
  const res = await fetch('/api/pos/reservas-mesas/configuracion', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchId, ajustes }),
  });
  const json = (await res.json().catch(() => ({}))) as { ajustes?: AjustesReservaDto; errores?: ErroresAjustes; codigo?: string };
  return { ok: res.ok && !!json.ajustes, ...json };
}

export function ReservasConfiguracion({ branchId, sedes, onSedeChange, onIrAgenda }: Props) {
  const t = useTranslations('posReservasMesas.configuracion');
  const { toast } = useToast();
  const moneda = useMonedaOrganizacion();

  const [datos, setDatos] = useState<RespuestaConfiguracion | null>(null);
  const [guardado, setGuardado] = useState<AjustesReservaDto | null>(null);
  const [ajustes, setAjustes] = useState<AjustesReservaDto | null>(null);
  const [estado, setEstado] = useState<EstadoConfig>('cargando');
  const [errores, setErrores] = useState<ErroresAjustes>({});
  const [correoNuevo, setCorreoNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [copiaDe, setCopiaDe] = useState<SedeConfig | null>(null);
  const [copiarAbierto, setCopiarAbierto] = useState(false);
  const [destino, setDestino] = useState('');

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const json = await leer(branchId);
      setDatos(json);
      setGuardado(json.sede.propia);
      setAjustes(json.sede.propia);
      setErrores({});
      setEstado(!json.puedeEditar ? 'sinPermiso' : json.sede.propia ? 'listo' : 'vacio');
    } catch {
      setEstado('error');
    }
  }, [branchId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // «Copiar de <otra sede>» en el estado vacío: la primera sede que ya tiene configuración propia.
  useEffect(() => {
    if (estado !== 'vacio') return;
    let vivo = true;
    (async () => {
      for (const s of sedes.filter((x) => x.id !== branchId).slice(0, 6)) {
        try {
          const r = await leer(s.id);
          if (r.sede.propia) {
            if (vivo) setCopiaDe(s);
            return;
          }
        } catch {
          /* siguiente */
        }
      }
      if (vivo) setCopiaDe(null);
    })();
    return () => {
      vivo = false;
    };
  }, [estado, sedes, branchId]);

  const guardar = useCallback(
    async (valores: AjustesReservaDto, destinoId: number | null = branchId) => {
      const local = validarAjustesReserva(valores);
      if (!local.ok) {
        setErrores(local.errores);
        toast({ title: t('revisa'), variant: 'destructive' });
        return false;
      }
      setGuardando(true);
      try {
        const r = await escribir(destinoId, local.ajustes);
        if (!r.ok || !r.ajustes) {
          if (r.errores) setErrores(r.errores);
          toast({ title: t('errorGuardar'), description: r.codigo === 'SIN_PERMISO' ? t('sinPermiso.titulo') : undefined, variant: 'destructive' });
          return false;
        }
        if (destinoId === branchId) {
          setGuardado(r.ajustes);
          setAjustes(r.ajustes);
          setErrores({});
          setEstado('listo');
        }
        return true;
      } finally {
        setGuardando(false);
      }
    },
    [branchId, toast, t],
  );

  const cambios = useMemo(() => (ajustes && guardado ? contarCambiosAjustes(ajustes, guardado) : 0), [ajustes, guardado]);

  // Ctrl+S / Cmd+S guarda.
  useEffect(() => {
    if (estado !== 'listo' || cambios === 0) return;
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (ajustes) void guardar(ajustes).then((ok) => ok && toast({ title: t('guardado') }));
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [estado, cambios, ajustes, guardar, toast, t]);

  const cambiar = <K extends keyof AjustesReservaDto>(clave: K, valor: AjustesReservaDto[K]) => setAjustes((a) => (a ? { ...a, [clave]: valor } : a));

  const horarioSucursal = useMemo(() => horarioDesdeSucursal(datos?.horarioSucursal), [datos?.horarioSucursal]);
  const horarioDeSucursal = !!ajustes && JSON.stringify(ajustes.service_hours) === JSON.stringify(horarioSucursal) && Object.keys(horarioSucursal).length > 0;

  return (
    <>
      <ConfiguracionVista
        estado={estado}
        sedes={sedes}
        sedeId={branchId}
        onSedeChange={onSedeChange}
        ajustes={ajustes}
        cambios={cambios}
        errores={errores}
        correoNuevo={correoNuevo}
        onCorreoNuevoChange={setCorreoNuevo}
        cambiar={cambiar}
        zonas={datos?.zonas ?? []}
        mesas={datos?.mesas ?? { total: 0, porZona: {} }}
        pasarela={datos?.pasarela ?? null}
        moneda={moneda.code}
        host={datos?.host ?? null}
        horarioDeSucursal={horarioDeSucursal}
        onRestablecerHorario={() => cambiar('service_hours', horarioSucursal)}
        guardando={guardando}
        onGuardar={() => ajustes && void guardar(ajustes).then((ok) => ok && toast({ title: t('guardado') }))}
        onDescartar={() => {
          setAjustes(guardado);
          setErrores({});
        }}
        onConfigurarRecomendados={() => {
          if (!datos) return;
          const base = { ...datos.recomendados, ...(datos.sede.organizacion ?? {}), is_enabled: true };
          const horario = Object.keys(horarioSucursal).length > 0 ? horarioSucursal : base.service_hours;
          void guardar({ ...base, service_hours: horario }).then((ok) => ok && toast({ title: t('guardado') }));
        }}
        onCopiarDe={
          copiaDe
            ? () =>
                void leer(copiaDe.id).then((r) => {
                  if (r.sede.propia) void guardar({ ...r.sede.propia }).then((ok) => ok && toast({ title: t('copiada', { sede: copiaDe.nombre }) }));
                })
            : null
        }
        nombreSedeCopia={copiaDe?.nombre ?? null}
        onCopiarA={() => {
          setDestino('');
          setCopiarAbierto(true);
        }}
        onReintentar={() => void cargar()}
        onIrAgenda={onIrAgenda}
      />
      <Dialogo
        abierto={copiarAbierto}
        onAbiertoChange={setCopiarAbierto}
        titulo={t('copiarTitulo')}
        descripcion={t('copiarDescripcion')}
        icono={Copy}
        ancho={440}
        primario={{
          etiqueta: t('copiarConfirmar'),
          cargando: guardando,
          deshabilitada: !destino || !ajustes,
          onClick: () => {
            if (!ajustes || !destino) return;
            const s = sedes.find((x) => String(x.id) === destino);
            void guardar(ajustes, Number(destino)).then((ok) => {
              if (ok) {
                setCopiarAbierto(false);
                toast({ title: t('copiadaA', { sede: s?.nombre ?? '' }) });
              }
            });
          },
        }}
      >
        <FormField etiqueta={t('sedeDestino')}>
          {(c) => (
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirSede')} />
              </SelectTrigger>
              <SelectContent>
                {sedes
                  .filter((s) => s.id !== branchId)
                  .map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </Dialogo>
    </>
  );
}

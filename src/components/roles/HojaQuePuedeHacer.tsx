'use client';

/**
 * «¿Qué puede hacer esta persona?» (Figma «13. Equipo › Roles y permisos»,
 * flujo 7 y móvil). Hoja lateral (en móvil, a pantalla completa) con:
 *  - buscador que explica por qué SÍ o NO puede algo («Ni su rol ni su cargo le
 *    dan «pos.void». Es un permiso sensible: mueve dinero.»);
 *  - «rol + cargo = puede hacer» (TarjetaRolCargo) y cada permiso con su
 *    origen (ChipOrigen);
 *  - el alcance por sucursal (SelectorAlcanceSucursal), editable con users.edit.
 * Todo lo calcula el servidor con la misma función que el resto de la app
 * (`get_user_permission_codes`); aquí no se decide nada.
 *
 * Se exporta para que Organización › Miembros la abra desde cada persona.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Crown } from 'lucide-react';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { SearchInput } from '@/components/kit/SearchInput';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import { normalizarTexto } from '@/lib/roles/matrizPermisos';
import { agruparEfectivos, explicar, type PermisoConOrigen } from '@/lib/roles/permisosEfectivos';
import type { QuePuedeHacer } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';
import { ChipOrigen } from './ChipOrigen';
import { SelectorAlcanceSucursal, type ModoAlcance } from './SelectorAlcanceSucursal';
import { TarjetaRolCargo } from './TarjetaRolCargo';
import { useEtiquetasRoles } from './useEtiquetasRoles';
import { useCargaRoles } from './useCargaRoles';

export interface HojaQuePuedeHacerProps {
  /** organization_members.id; null = cerrada. */
  memberId: number | null;
  onAbiertoChange: (abierto: boolean) => void;
}

const minuscula = (s: string) => s.charAt(0).toLocaleLowerCase('es') + s.slice(1);

export function HojaQuePuedeHacer({ memberId, onAbiertoChange }: HojaQuePuedeHacerProps) {
  const t = useTranslations('roles.quePuede');
  return (
    <HojaDetalle abierto={memberId !== null} onAbiertoChange={onAbiertoChange} titulo={t('titulo')} ancho={560}>
      {memberId !== null && <Contenido memberId={memberId} />}
    </HojaDetalle>
  );
}

function Contenido({ memberId }: { memberId: number }) {
  const tr = useTranslations('roles');
  const { etiquetaModulo, mensajeError } = useEtiquetasRoles();
  const { estado, datos, recargar } = useCargaRoles(() => clienteRoles.quePuedeHacer(memberId), String(memberId));
  const [termino, setTermino] = useState('');

  if (estado === 'cargando' || (!datos && estado === 'listo')) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    );
  }
  if (estado === 'sinPermiso') {
    return <EmptyState variante="forbidden" titulo={tr('estados.sinPermisoTitulo')} descripcion={tr('errores.sin_permiso')} compacto />;
  }
  if (estado !== 'listo' || !datos) {
    return <EmptyState variante="error" titulo={tr('estados.errorTitulo')} descripcion={tr('estados.errorDesc')} onReintentar={() => void recargar()} compacto />;
  }
  return <Detalle datos={datos} termino={termino} setTermino={setTermino} etiquetaModulo={etiquetaModulo} mensajeError={mensajeError} onGuardado={() => void recargar(true)} />;
}

function Detalle({
  datos,
  termino,
  setTermino,
  etiquetaModulo,
  mensajeError,
  onGuardado,
}: {
  datos: QuePuedeHacer;
  termino: string;
  setTermino: (v: string) => void;
  etiquetaModulo: (m: string) => string;
  mensajeError: (c: string) => string;
  onGuardado: () => void;
}) {
  const t = useTranslations('roles.quePuede');
  const tr = useTranslations('roles');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const permisos: PermisoConOrigen[] = useMemo(() => {
    const porId = new Map(datos.permisos.map((p) => [p.id, p]));
    return datos.catalogo.map((permiso) => {
      const p = porId.get(permiso.id);
      return { permiso, concedido: p?.concedido ?? false, origenes: p?.origenes ?? [], quitadoPorCargo: p?.quitadoPorCargo ?? false };
    });
  }, [datos]);

  const q = normalizarTexto(termino);
  const coincidencias = useMemo(() => {
    if (!q) return [];
    const palabras = q.split(/\s+/);
    return permisos.filter((p) => {
      const texto = normalizarTexto(`${p.permiso.nombre} ${p.permiso.codigo} ${etiquetaModulo(p.permiso.modulo)}`);
      return palabras.every((w) => texto.includes(w));
    });
  }, [permisos, q, etiquetaModulo]);

  const grupos = useMemo(
    () => agruparEfectivos(q ? coincidencias : permisos, etiquetaModulo, !q),
    [permisos, coincidencias, q, etiquetaModulo],
  );
  const principal = coincidencias[0];
  const persona = datos.miembro.nombre;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">
        {datos.cargo
          ? t('subtituloConCargo', { persona, rol: datos.rol.nombre, cargo: datos.cargo.nombre })
          : t('subtitulo', { persona, rol: datos.rol.nombre })}
      </p>
      <SearchInput value={termino} onChange={setTermino} onValueChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} />

      {principal && <Explicacion p={principal} datos={datos} />}
      {q && coincidencias.length === 0 && <p className="text-sm text-fg-secondary">{t('sinCoincidencias', { termino })}</p>}

      {datos.accesoTotal && (
        <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
          <Crown aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {datos.motivoAccesoTotal === 'superAdmin' ? t('accesoTotalSuper') : t('accesoTotalRol', { rol: datos.rol.nombre })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
        <span>{t('conteo', { n: datos.total })}</span>
        {datos.accesoTotal ? (
          <ChipOrigen origen="admin" />
        ) : (
          <>
            <ChipOrigen origen="rol" />
            {datos.cargo && <ChipOrigen origen="cargo" />}
          </>
        )}
        {datos.alcance.modo === 'algunas' && <ChipOrigen origen="sucursal" />}
      </div>

      <TarjetaRolCargo
        orientacion="vertical"
        rol={{ nombre: datos.rol.nombre, total: datos.rol.total }}
        cargo={datos.cargo ? { nombre: datos.cargo.nombre, suma: datos.cargo.suma } : null}
        resultado={{ nombre: persona, total: datos.total }}
      />

      <div className="overflow-hidden rounded-xl border border-line">
        {grupos.map((g) => {
          const abierto = abiertos.has(g.modulo) || q !== '';
          return (
            <section key={g.modulo} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={abierto}
                onClick={() =>
                  setAbiertos((prev) => {
                    const s = new Set(prev);
                    if (s.has(g.modulo)) s.delete(g.modulo);
                    else s.add(g.modulo);
                    return s;
                  })
                }
                className="flex min-h-12 w-full items-center gap-2 bg-subtle px-3 text-left text-sm font-medium text-fg"
              >
                {abierto ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                <span className="flex-1">{etiquetaModulo(g.modulo)}</span>
                <span className="tabular-nums text-fg-secondary">{g.concedidos}</span>
              </button>
              {abierto && (
                <ul>
                  {g.permisos.map((p) => (
                    <li key={p.permiso.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className={cn('min-w-0', p.concedido ? 'text-fg' : 'text-fg-muted line-through')}>{p.permiso.nombre}</span>
                      <span className="flex shrink-0 gap-1">
                        {p.origenes.map((o) => (
                          <ChipOrigen key={o} origen={o} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Alcance datos={datos} mensajeError={mensajeError} onGuardado={onGuardado} />
      <p className="text-xs text-fg-muted">{tr('regla')}</p>
    </div>
  );
}

function Explicacion({ p, datos }: { p: PermisoConOrigen; datos: QuePuedeHacer }) {
  const t = useTranslations('roles.quePuede');
  const e = explicar(p);
  const permiso = minuscula(p.permiso.nombre);
  if (e.tipo === 'puede') {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle p-3 text-sm text-success-text">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          <strong className="font-semibold">{t('puede', { permiso })}</strong>
          <span className="flex flex-wrap gap-1">
            {e.origenes.map((o) => (
              <ChipOrigen key={o} origen={o} etiqueta={o === 'rol' ? datos.rol.nombre : o === 'cargo' ? datos.cargo?.nombre : undefined} />
            ))}
          </span>
        </div>
      </div>
    );
  }
  const cargo = datos.cargo?.nombre;
  const detalle =
    e.motivo === 'cargoLoQuita'
      ? t('noPuedeCargoQuita', { rol: datos.rol.nombre, cargo: cargo ?? '—' })
      : cargo
        ? t('noPuedeNinguno', { rol: datos.rol.nombre, cargo, codigo: p.permiso.codigo })
        : t('noPuedeNingunoSinCargo', { rol: datos.rol.nombre, codigo: p.permiso.codigo });
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
      <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">{t('noPuede', { permiso })}</strong>
        <span>
          {detalle}
          {e.sensible && p.permiso.sensible ? ` ${t('noPuedeSensible', { tipo: t(`tipoSensible.${p.permiso.sensible}`) })}` : ''}
        </span>
      </div>
    </div>
  );
}

function Alcance({ datos, mensajeError, onGuardado }: { datos: QuePuedeHacer; mensajeError: (c: string) => string; onGuardado: () => void }) {
  const t = useTranslations('roles.quePuede');
  const [modo, setModo] = useState<ModoAlcance>(datos.alcance.modo);
  const [seleccion, setSeleccion] = useState<number[]>(datos.alcance.asignadas);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setModo(datos.alcance.modo);
    setSeleccion(datos.alcance.asignadas);
  }, [datos]);

  const editable = datos.puedeEditarAlcance && datos.modeloListo;
  const cambiado = modo !== datos.alcance.modo || (modo === 'algunas' && seleccion.join(',') !== datos.alcance.asignadas.join(','));

  const guardar = async () => {
    setGuardando(true);
    try {
      await clienteRoles.guardarAlcance(datos.miembro.id, modo === 'todas' ? null : seleccion);
      toast.success(t('alcanceGuardado'));
      onGuardado();
    } catch (err) {
      toast.error(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line p-4" aria-label={t('alcance')}>
      <h3 className="text-sm font-semibold text-fg">{t('alcance')}</h3>
      {datos.alcance.esAdmin ? (
        <p className="text-sm text-fg-secondary">{t('alcanceAdmin')}</p>
      ) : (
        <>
          <SelectorAlcanceSucursal
            sucursales={datos.alcance.sucursales}
            modo={modo}
            seleccion={seleccion}
            deshabilitado={!editable || guardando}
            onCambio={(m, s) => {
              setModo(m);
              setSeleccion(s);
            }}
          />
          {!editable && <p className="text-xs text-fg-muted">{datos.modeloListo ? t('noEditaAlcance') : mensajeError('migracion_pendiente')}</p>}
          {editable && cambiado && (
            <button
              type="button"
              disabled={guardando || (modo === 'algunas' && seleccion.length === 0)}
              aria-busy={guardando || undefined}
              onClick={() => void guardar()}
              className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'self-end' })}
            >
              {t('guardarAlcance')}
            </button>
          )}
        </>
      )}
    </section>
  );
}

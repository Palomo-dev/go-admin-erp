'use client';

/**
 * «Agregar clientes a «Lista»» (Figma «05 POS y ventas» 05 y 05b, 3020:273928 / 3020:274050).
 *
 * - Clientes: uno a uno; muestra la lista que cada cliente tiene hoy y avisa de los que cambian
 *   («pasa de «Tenderos zona norte» a «Mayoristas»»). Uno a uno gana sobre el grupo.
 * - Grupo del CRM: un segmento; quien entra o sale del grupo cambia de lista solo. Los clientes del
 *   grupo con lista uno a uno se quedan con la suya.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal, Dialogo, TabBar } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ListasPreciosService, ErrorPeticionLista } from '@/lib/services/listasPreciosService';
import type { CandidatoCliente, CandidatoGrupo } from '@/lib/listasPrecios/tipos';

type Pestana = 'clientes' | 'grupo';

export function AgregarClientesDialog({
  abierto,
  onAbiertoChange,
  listaId,
  listaNombre,
  pestanaInicial = 'clientes',
  onAgregado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  listaId: string;
  listaNombre: string;
  pestanaInicial?: Pestana;
  onAgregado: () => void;
}) {
  const t = useTranslations('listasPrecios.agregar');
  const te = useTranslations('listasPrecios.errores');
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<CandidatoCliente[]>([]);
  const [grupos, setGrupos] = useState<CandidatoGrupo[]>([]);
  const [elegidos, setElegidos] = useState<Map<string, CandidatoCliente>>(new Map());
  const [grupo, setGrupo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (abierto) setPestana(pestanaInicial);
  }, [abierto, pestanaInicial]);

  useEffect(() => {
    if (!abierto || pestana !== 'clientes') return;
    let vivo = true;
    const h = setTimeout(() => {
      ListasPreciosService.candidatosClientes(listaId, q)
        .then((c) => vivo && setClientes(c))
        .catch(() => vivo && setClientes([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(h);
    };
  }, [abierto, pestana, q, listaId]);

  useEffect(() => {
    if (!abierto || pestana !== 'grupo') return;
    let vivo = true;
    ListasPreciosService.candidatosGrupos(listaId)
      .then((g) => vivo && setGrupos(g))
      .catch(() => vivo && setGrupos([]));
    return () => {
      vivo = false;
    };
  }, [abierto, pestana, listaId]);

  const cerrar = () => {
    setElegidos(new Map());
    setGrupo(null);
    setQ('');
    onAbiertoChange(false);
  };

  const cambian = useMemo(() => Array.from(elegidos.values()).filter((c) => c.lista_actual_id && c.lista_actual_id !== listaId), [elegidos, listaId]);
  const grupoElegido = grupos.find((g) => g.segment_id === grupo) ?? null;

  const agregar = async () => {
    setOcupado(true);
    try {
      if (pestana === 'clientes') {
        await ListasPreciosService.asignarClientes(listaId, Array.from(elegidos.keys()));
        toast.success(t('listoClientes', { n: elegidos.size }));
      } else if (grupo) {
        await ListasPreciosService.asignarGrupo(listaId, grupo);
        toast.success(t('listoGrupo', { nombre: grupoElegido?.name ?? '' }));
      }
      onAgregado();
      cerrar();
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
    } finally {
      setOcupado(false);
    }
  };

  const alternar = (c: CandidatoCliente, si: boolean) =>
    setElegidos((m) => {
      const n = new Map(m);
      if (si) n.set(c.id, c);
      else n.delete(c.id);
      return n;
    });

  const doc = (c: { doc_type: string | null; doc_number: string | null }) => [c.doc_type, c.doc_number].filter(Boolean).join(' ');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => (v ? onAbiertoChange(true) : cerrar())}
      titulo={t('titulo', { nombre: listaNombre })}
      descripcion={t('descripcion')}
      ancho={672}
      icono={UserPlus}
      primario={
        pestana === 'clientes'
          ? { etiqueta: t('agregarN', { n: elegidos.size }), onClick: () => void agregar(), cargando: ocupado, deshabilitada: elegidos.size === 0, motivo: t('eligeAlguno') }
          : { etiqueta: t('agregarGrupo'), onClick: () => void agregar(), cargando: ocupado, deshabilitada: !grupo, motivo: t('eligeGrupo') }
      }
      pie={
        <span className="text-sm text-fg-secondary">
          {pestana === 'clientes'
            ? t('seleccionados', { n: elegidos.size })
            : grupoElegido
              ? t('cambianAGrupo', { n: Math.max(0, grupoElegido.miembros - grupoElegido.con_directa) })
              : ''}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <TabBar
          id="agregar-clientes"
          etiqueta={t('titulo', { nombre: listaNombre })}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={[
            { valor: 'clientes', etiqueta: t('pestanaClientes') },
            { valor: 'grupo', etiqueta: t('pestanaGrupo') },
          ]}
        />
        {pestana === 'clientes' ? (
          <>
            <label className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <input
                className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                placeholder={t('buscar')}
                aria-label={t('buscar')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <ul className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {clientes.map((c) => {
                const yaEsta = c.lista_actual_id === listaId && c.via === 'directo';
                return (
                  <li key={c.id} className={`flex items-center gap-3 px-3 py-2 ${yaEsta ? 'opacity-60' : ''}`}>
                    <Checkbox
                      checked={elegidos.has(c.id)}
                      disabled={yaEsta}
                      onCheckedChange={(v) => alternar(c, v === true)}
                      aria-label={c.nombre ?? c.id}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{c.nombre ?? '—'}</span>
                      <span className="block truncate text-xs text-fg-muted">{doc(c)}</span>
                    </span>
                    {yaEsta ? (
                      <Badge tono="neutro" apariencia="suave" tamano="sm">{t('yaEsta')}</Badge>
                    ) : c.lista_actual ? (
                      <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('hoy', { lista: c.lista_actual })}</Badge>
                    ) : (
                      <span className="text-xs text-fg-muted">{t('sinLista')}</span>
                    )}
                  </li>
                );
              })}
              {clientes.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-secondary">{t('sinResultados')}</li>}
            </ul>
            {cambian.length > 0 && (
              <AvisoTonal
                tono="advertencia"
                compacto
                titulo={
                  cambian.length === 1
                    ? t('cambiaUno', { nombre: cambian[0].nombre ?? '', antes: cambian[0].lista_actual ?? '', despues: listaNombre })
                    : t('cambianVarios', { n: cambian.length, despues: listaNombre })
                }
              />
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-fg-secondary">{t('grupoAyuda')}</p>
            <ul role="radiogroup" aria-label={t('pestanaGrupo')} className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {grupos.map((g) => {
                const asignado = g.lista_id === listaId;
                const elegido = grupo === g.segment_id;
                return (
                  <li key={g.segment_id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={elegido}
                      disabled={asignado}
                      onClick={() => setGrupo(g.segment_id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-60 ${elegido ? 'bg-brand-tint' : 'hover:bg-hover'}`}
                    >
                      <span className={`size-4 shrink-0 rounded-full border ${elegido ? 'border-4 border-brand' : 'border-line-strong'}`} aria-hidden="true" />
                      <Users aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{g.name}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {t('grupoDetalle', { n: g.miembros, tipo: g.is_dynamic ? t('dinamico') : t('fijo') })}
                        </span>
                      </span>
                      {asignado ? (
                        <Badge tono="neutro" apariencia="suave" tamano="sm">{t('asignado')}</Badge>
                      ) : g.lista ? (
                        <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('hoy', { lista: g.lista })}</Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {grupos.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-secondary">{t('sinGrupos')}</li>}
            </ul>
            {grupoElegido && grupoElegido.con_directa > 0 && (
              <AvisoTonal
                tono="informacion"
                compacto
                titulo={t('grupoConDirectos', { n: grupoElegido.con_directa, grupo: grupoElegido.name, lista: grupoElegido.con_directa_lista ?? '' })}
              />
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}

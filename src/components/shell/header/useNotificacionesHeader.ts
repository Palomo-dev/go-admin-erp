'use client';

/**
 * Datos de la campana del header: notificaciones «Mías» y «Todas», conteos de
 * no leídas y recordatorios de tareas (si el módulo PM está activo).
 *
 * Es la lógica de `app-layout/Header/NotificationsMenu.tsx` sacada del
 * componente para que la usen a la vez la campana de escritorio y la pestaña
 * «Alertas» del MobileTabBar sin duplicar consultas ni suscripciones.
 * Se conserva lo que ese componente ya había corregido:
 * - las de tareas se excluyen en la consulta (no en el cliente) si PM está
 *   inactivo, para que el `limit` no las entierre;
 * - la suscripción Realtime vive en su propio efecto y su canal lleva la
 *   organización, para no entregar eventos de otra;
 * - «Descartar» y «Marcar como no leída» son por persona
 *   (`notification_dismissals`, `notification_reads`): no afectan a los demás;
 * - la lectura es por persona (`notification_reads`) y «marcar todas» va por
 *   RPC atómica.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useTaskReminders } from '@/lib/hooks/useTaskReminders';
import { useOptimizedModules } from '@/hooks/useOptimizedModules';

export interface NotificacionHeader {
  id: string;
  organization_id: number;
  recipient_user_id?: string;
  channel: string;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  payload: { type?: string; title?: string; content?: string; [clave: string]: unknown };
  status: string;
  read_at: string | null;
  is_read_by_me?: boolean;
  created_at: string;
}

export type AlcanceNotificaciones = 'mine' | 'all';

interface AvisoMiembroFila {
  id: string;
  organization_id: number;
  recipient_user_id: string;
  event: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
}

function avisoANotificacion(fila: AvisoMiembroFila): NotificacionHeader {
  const tarea = fila.entity_type === 'task';
  return {
    id: fila.id,
    organization_id: fila.organization_id,
    recipient_user_id: fila.recipient_user_id,
    channel: 'in_app',
    payload: {
      type: fila.event,
      title: fila.title,
      content: fila.body,
      href: fila.href,
      source: 'member_notice',
      ...(tarea ? { task_id: fila.entity_id } : { opportunity_id: fila.entity_id }),
    },
    status: 'sent',
    read_at: fila.read_at,
    is_read_by_me: !!fila.read_at,
    created_at: fila.created_at,
  };
}

function esAvisoMiembro(n: NotificacionHeader): boolean {
  return n.payload?.source === 'member_notice';
}

/** Filas de más que se piden para que, tras quitar las descartadas, la lista siga llena. */
const MARGEN_DESCARTADAS = 20;

const TIPOS_TAREA = '("task_assigned","task_completed","task_agent","task_rescheduled","task_reschedule_summary")';

export function useNotificacionesHeader(organizationId: string | null) {
  const [mias, setMias] = useState<NotificacionHeader[]>([]);
  const [todas, setTodas] = useState<NotificacionHeader[]>([]);
  const [noLeidasMias, setNoLeidasMias] = useState(0);
  const [noLeidasTodas, setNoLeidasTodas] = useState(0);
  const [avisosNoLeidos, setAvisosNoLeidos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const orgNum = organizationId ? parseInt(organizationId, 10) : undefined;
  const { canAccessModule } = useOptimizedModules(orgNum);
  const pmActivo = canAccessModule('pm');
  const { taskReminders, loading: cargandoTareas, refreshReminders } = useTaskReminders(organizationId);

  const cargarRef = useRef<(silencioso?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const cargar = async (silencioso = false) => {
      if (!organizationId || !userId || !orgNum) return;
      if (!silencioso) setCargando(true);
      try {
        let consultaMias = supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .eq('recipient_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15 + MARGEN_DESCARTADAS);
        let consultaTodas = supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .limit(20 + MARGEN_DESCARTADAS);
        if (!pmActivo) {
          consultaMias = consultaMias.not('payload->>type', 'in', TIPOS_TAREA);
          consultaTodas = consultaTodas.not('payload->>type', 'in', TIPOS_TAREA);
        }
        let consultaAvisos = supabase
          .from('member_notices')
          .select('id, organization_id, recipient_user_id, event, entity_type, entity_id, title, body, href, read_at, created_at')
          .eq('organization_id', orgNum)
          .eq('recipient_user_id', userId)
          .is('dismissed_at', null)
          .order('created_at', { ascending: false })
          .limit(15);
        let conteoAvisos = supabase
          .from('member_notices')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgNum)
          .eq('recipient_user_id', userId)
          .is('dismissed_at', null)
          .is('read_at', null);
        if (!pmActivo) {
          consultaAvisos = consultaAvisos.not('event', 'like', 'tarea.%');
          conteoAvisos = conteoAvisos.not('event', 'like', 'tarea.%');
        }

        const [rMias, rTodas, rNoLeidasMias, rNoLeidasTodas, rAvisos, rConteoAvisos] = await Promise.all([
          consultaMias,
          consultaTodas,
          supabase.rpc('get_unread_notifications_count', { p_organization_id: orgNum, p_scope: 'mine', p_exclude_task_types: !pmActivo }),
          supabase.rpc('get_unread_notifications_count', { p_organization_id: orgNum, p_scope: 'all', p_exclude_task_types: !pmActivo }),
          consultaAvisos,
          conteoAvisos,
        ]);
        if (rMias.error) throw rMias.error;
        if (rTodas.error) throw rTodas.error;

        const filasMias = (rMias.data ?? []) as NotificacionHeader[];
        const filasTodas = (rTodas.data ?? []) as NotificacionHeader[];
        const ids = Array.from(new Set([...filasMias, ...filasTodas].map((n) => n.id)));
        let leidas = new Set<string>();
        let descartadas = new Set<string>();
        if (ids.length > 0) {
          const [rLeidas, rDescartadas] = await Promise.all([
            supabase.from('notification_reads').select('notification_id').eq('user_id', userId).in('notification_id', ids),
            supabase.from('notification_dismissals').select('notification_id').eq('user_id', userId).in('notification_id', ids),
          ]);
          leidas = new Set((rLeidas.data ?? []).map((r: { notification_id: string }) => r.notification_id));
          descartadas = new Set((rDescartadas.data ?? []).map((r: { notification_id: string }) => r.notification_id));
        }
        const visibles = (lista: NotificacionHeader[], tope: number) =>
          lista
            .filter((n) => !descartadas.has(n.id))
            .slice(0, tope)
            .map((n) => ({ ...n, is_read_by_me: leidas.has(n.id) }));

        const avisos = rAvisos.error
          ? []
          : ((rAvisos.data ?? []) as AvisoMiembroFila[]).map(avisoANotificacion);
        if (rAvisos.error) console.error('[useNotificacionesHeader] avisos', rAvisos.error.message);
        const noLeidosAvisos = rConteoAvisos.error ? 0 : (rConteoAvisos.count ?? 0);
        if (rConteoAvisos.error) console.error('[useNotificacionesHeader] conteo avisos', rConteoAvisos.error.message);
        const combinadas = [...visibles(filasMias, 15), ...avisos]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
          .slice(0, 15);

        setMias(combinadas);
        setTodas(visibles(filasTodas, 20));
        setAvisosNoLeidos(noLeidosAvisos);
        setNoLeidasMias(((rNoLeidasMias.data as number | null) ?? 0) + noLeidosAvisos);
        setNoLeidasTodas((rNoLeidasTodas.data as number | null) ?? 0);
      } catch (e) {
        console.error('[useNotificacionesHeader] cargar', e);
      } finally {
        setCargando(false);
      }
    };
    cargarRef.current = cargar;
    void cargar();
  }, [organizationId, orgNum, userId, pmActivo]);

  // Realtime: notificaciones de la organización y lecturas propias.
  useEffect(() => {
    if (!organizationId || !userId) return;
    let activo = true;
    const refrescar = () => {
      if (activo) void cargarRef.current(true);
    };
    const canalNotif = supabase
      .channel(`notifications-changes-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organizationId}` }, refrescar)
      .subscribe((estado) => {
        if (activo && (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')) console.warn('[useNotificacionesHeader] Realtime', estado);
      });
    const canalLecturas = supabase
      .channel(`notification-reads-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads', filter: `user_id=eq.${userId}` }, refrescar)
      .subscribe();
    const canalAvisos = supabase
      .channel(`member-notices-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_notices', filter: `recipient_user_id=eq.${userId}` }, refrescar)
      .subscribe();
    return () => {
      activo = false;
      void supabase.removeChannel(canalNotif);
      void supabase.removeChannel(canalLecturas);
      void supabase.removeChannel(canalAvisos);
    };
  }, [organizationId, userId]);

  const marcarLocal = (id: string) => {
    const marcar = (lista: NotificacionHeader[]) => lista.map((n) => (n.id === id ? { ...n, is_read_by_me: true } : n));
    setMias(marcar);
    setTodas(marcar);
    setNoLeidasMias((c) => Math.max(0, c - 1));
    setNoLeidasTodas((c) => Math.max(0, c - 1));
  };

  const marcarLeida = useCallback(
    async (n: NotificacionHeader) => {
      if (n.is_read_by_me || !userId) return;
      if (esAvisoMiembro(n)) {
        const { error } = await supabase
          .from('member_notices')
          .update({ read_at: new Date().toISOString() })
          .eq('id', n.id)
          .eq('recipient_user_id', userId);
        if (error) {
          console.error('[useNotificacionesHeader] aviso leído', error.message);
          return;
        }
        setMias((lista) => lista.map((item) => (item.id === n.id ? { ...item, is_read_by_me: true, read_at: new Date().toISOString() } : item)));
        setNoLeidasMias((c) => Math.max(0, c - 1));
        setAvisosNoLeidos((c) => Math.max(0, c - 1));
        return;
      }
      const { error } = await supabase.from('notification_reads').insert({ notification_id: n.id, user_id: userId });
      // 23505: ya estaba leída (otro dispositivo).
      if (!error || error.code === '23505') marcarLocal(n.id);
      else console.error('[useNotificacionesHeader] marcar leída', error.message);
    },
    [userId]
  );

  const marcarTodas = useCallback(
    async (alcance: AlcanceNotificaciones) => {
      if (!orgNum || !userId) return;
      const { data, error } = await supabase.rpc('mark_all_notifications_as_read', { p_organization_id: orgNum, p_scope: alcance });
      if (error) {
        console.error('[useNotificacionesHeader] marcar todas', error.message);
        return;
      }
      const insertadas = (data as number | null) ?? 0;
      const todasLeidas = (lista: NotificacionHeader[]) => lista.map((n) => ({ ...n, is_read_by_me: true }));
      setMias(todasLeidas);
      setNoLeidasMias(0);
      if (alcance === 'all') {
        setTodas(todasLeidas);
        setNoLeidasTodas(0);
      } else {
        setNoLeidasTodas((c) => Math.max(0, c - insertadas));
      }
      const { error: errorAvisos } = await supabase
        .from('member_notices')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', userId)
        .eq('organization_id', orgNum)
        .is('read_at', null)
        .is('dismissed_at', null);
      if (errorAvisos) console.error('[useNotificacionesHeader] avisos leídos', errorAvisos.message);
      else setAvisosNoLeidos(0);
    },
    [orgNum, userId]
  );

  /** Solo para quien la descarta (antes la borraba para toda la organización). También la marca leída. */
  const descartar = useCallback(
    async (n: NotificacionHeader) => {
      if (!userId) return;
      if (esAvisoMiembro(n)) {
        const ahora = new Date().toISOString();
        const { error } = await supabase
          .from('member_notices')
          .update({ dismissed_at: ahora, read_at: n.read_at ?? ahora })
          .eq('id', n.id)
          .eq('recipient_user_id', userId);
        if (error) {
          console.error('[useNotificacionesHeader] descartar aviso', error.message);
          return false;
        }
        if (!n.is_read_by_me) {
          setNoLeidasMias((c) => Math.max(0, c - 1));
          setAvisosNoLeidos((c) => Math.max(0, c - 1));
        }
        const quitarAviso = (lista: NotificacionHeader[]) => lista.filter((x) => x.id !== n.id);
        setMias(quitarAviso);
        return true;
      }
      const { error } = await supabase.from('notification_dismissals').insert({ notification_id: n.id, user_id: userId });
      if (error && error.code !== '23505') {
        console.error('[useNotificacionesHeader] descartar', error.message);
        return false;
      }
      if (!n.is_read_by_me) await marcarLeida(n);
      const quitar = (lista: NotificacionHeader[]) => lista.filter((x) => x.id !== n.id);
      setMias(quitar);
      setTodas(quitar);
      return true;
    },
    [userId, marcarLeida]
  );

  /** Borra la lectura propia: vuelve a contar como pendiente solo para esta persona. */
  const marcarNoLeida = useCallback(
    async (n: NotificacionHeader) => {
      if (!userId) return false;
      if (esAvisoMiembro(n)) {
        const { error } = await supabase
          .from('member_notices')
          .update({ read_at: null })
          .eq('id', n.id)
          .eq('recipient_user_id', userId);
        if (error) {
          console.error('[useNotificacionesHeader] aviso no leído', error.message);
          return false;
        }
        setMias((lista) => lista.map((x) => (x.id === n.id ? { ...x, is_read_by_me: false, read_at: null } : x)));
        setNoLeidasMias((c) => c + 1);
        setAvisosNoLeidos((c) => c + 1);
        return true;
      }
      const { error } = await supabase.from('notification_reads').delete().eq('notification_id', n.id).eq('user_id', userId);
      if (error) {
        console.error('[useNotificacionesHeader] marcar no leída', error.message);
        return false;
      }
      const desmarcar = (lista: NotificacionHeader[]) => lista.map((x) => (x.id === n.id ? { ...x, is_read_by_me: false } : x));
      setMias(desmarcar);
      setTodas(desmarcar);
      if (n.recipient_user_id === userId) setNoLeidasMias((c) => c + 1);
      setNoLeidasTodas((c) => c + 1);
      return true;
    },
    [userId]
  );

  const recordatorios = pmActivo ? taskReminders : [];

  return {
    mias,
    todas,
    noLeidasMias,
    noLeidasTodas,
    cargando,
    pmActivo,
    recordatorios,
    cargandoTareas,
    /** Lo que muestra el contador de la campana: no leídas + recordatorios. */
    pendientes: noLeidasTodas + recordatorios.length + avisosNoLeidos,
    marcarLeida,
    marcarTodas,
    descartar,
    marcarNoLeida,
    /** Tras completar o posponer una tarea desde la vista rápida. */
    refrescarTareas: refreshReminders,
  };
}

export type NotificacionesHeader = ReturnType<typeof useNotificacionesHeader>;

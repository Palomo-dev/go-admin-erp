'use client';

/**
 * Dashboard para empleados (no-admin / no-manager).
 *
 * A diferencia del dashboard financiero (KPIs, tendencia, actividad con
 * montos), este panel NO muestra datos financieros de la organización.
 * Muestra:
 *  - Marcar Turno (QR)
 *  - Mis tareas asignadas (PM module, filtradas por assigned_to = usuario)
 *  - Mis notificaciones (recipient_user_id = usuario)
 *  - Accesos rápidos filtrados por los módulos/páginas que el cargo del
 *    empleado tiene permitido ver (según permContext.moduleAccess).
 *
 * La regla de quién ve el dashboard financiero vs este panel se decide en
 * `app/app/inicio/page.tsx` (canSeeFinancialDashboard). Este componente se
 * renderiza solo para empleados.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  QrCode,
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  Inbox,
  ShoppingCart,
  Package,
  Users,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState, StatusBadge, Tarjeta, type TonoBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import type { UserPermissionContext } from '@/lib/middleware/permissions';
import { NotificationService } from '@/components/app-layout/Header/Notifications/NotificationService';
import type { Notification } from '@/components/app-layout/Header/Notifications/types';

interface EmployeeDashboardProps {
  organizationId?: number | null;
  userId?: string | null;
  permContext: UserPermissionContext | null;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  type: string | null;
}

// ─── Accesos rápidos filtrados por permisos del cargo ────────────────────────
// Mapeo de código de módulo a { href, icon, labelKey }.
// Solo se muestran los módulos que el usuario tiene en permContext.moduleAccess.
const MODULE_ACCESS_CATALOG: Array<{
  moduleCode: string;
  href: string;
  icon: LucideIcon;
  color: string;
}> = [
  { moduleCode: 'pos', href: '/app/pos', icon: ShoppingCart, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  { moduleCode: 'inventory', href: '/app/inventario', icon: Package, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
  { moduleCode: 'crm', href: '/app/crm', icon: Users, color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400' },
  { moduleCode: 'hrm', href: '/app/hrm', icon: Clock, color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' },
  { moduleCode: 'calendar', href: '/app/calendario', icon: CalendarDays, color: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400' },
  { moduleCode: 'notifications', href: '/app/notificaciones', icon: Bell, color: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' },
];

// Estado de la tarea con `StatusBadge` y tono explícito: la tabla única del kit
// no conoce `todo` / `in_progress` / `done` (son estados del módulo PM).
const TASK_STATUS_CONFIG: Record<string, { labelKey: string; tono: TonoBadge; icon: LucideIcon }> = {
  todo: { labelKey: 'home.taskStatus.todo', tono: 'neutro', icon: Circle },
  in_progress: { labelKey: 'home.taskStatus.inProgress', tono: 'informacion', icon: Clock },
  done: { labelKey: 'home.taskStatus.done', tono: 'exito', icon: CheckCircle2 },
  completed: { labelKey: 'home.taskStatus.done', tono: 'exito', icon: CheckCircle2 },
};

const CLASE_VER_TODAS =
  'flex items-center gap-1 rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EmployeeDashboard({ organizationId, userId, permContext }: EmployeeDashboardProps) {
  const t = useTranslations('home');
  const tRoot = useTranslations();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(true);

  // ─── Cargar tareas asignadas al usuario ───────────────────────────────────
  const loadTasks = useCallback(async () => {
    if (!organizationId || !userId) {
      setTasksLoading(false);
      return;
    }
    try {
      setTasksLoading(true);
      // Tareas del módulo PM asignadas al usuario actual, no completadas.
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, type')
        .eq('organization_id', organizationId)
        .eq('assigned_to', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTasks((data || []) as TaskItem[]);
    } catch (err) {
      console.error('Error cargando tareas del empleado:', err);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [organizationId, userId]);

  // ─── Cargar notificaciones del usuario ────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    if (!organizationId || !userId) {
      setNotifLoading(false);
      return;
    }
    try {
      setNotifLoading(true);
      const { notifications: notifs, unreadCount: unread } =
        await NotificationService.getNotifications(String(organizationId), userId, 5);
      setNotifications(notifs);
      setUnreadCount(unread);
    } catch (err) {
      console.error('Error cargando notificaciones del empleado:', err);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotifLoading(false);
    }
  }, [organizationId, userId]);

  useEffect(() => {
    loadTasks();
    loadNotifications();
  }, [loadTasks, loadNotifications]);

  // ─── Accesos filtrados por permisos del cargo ─────────────────────────────
  const allowedModules = permContext?.moduleAccess ?? [];
  const accessibleShortcuts = MODULE_ACCESS_CATALOG.filter(
    (item) => allowedModules.includes(item.moduleCode),
  );

  return (
    <div className="space-y-6">
      {/* Marcar Turno destacado */}
      <Card className="dark:bg-gray-800/50 border-blue-200 dark:border-blue-900">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <QrCode className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('markShift')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('markShiftDesc')}
              </p>
            </div>
          </div>
          <Link href="/marcar">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <QrCode className="h-4 w-4 mr-2" />
              {t('markShift')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Accesos rápidos filtrados por permisos del cargo */}
      {accessibleShortcuts.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
          {accessibleShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group min-w-0"
              >
                <div className={cn('p-2 rounded-lg group-hover:scale-110 transition-transform', shortcut.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight truncate w-full">
                  {t(`shortcuts.${shortcut.moduleCode === 'notifications' ? 'notifications' : shortcut.moduleCode === 'config' ? 'config' : shortcut.moduleCode}`)}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mis tareas */}
        <Tarjeta
          titulo={t('myTasks')}
          icono={CheckCircle2}
          accion={
            <Link href="/app/pm" className={CLASE_VER_TODAS}>
              {t('viewAll')}
              <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            </Link>
          }
        >
          {tasksLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState compacto icono={Inbox} titulo={t('noTasks')} descripcion={t('panel.sinTareasDesc')} />
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => {
                const statusConfig = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.todo;
                const StatusIcon = statusConfig.icon;
                return (
                  <Link
                    key={task.id}
                    href="/app/pm"
                    className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <StatusIcon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {task.title}
                      </p>
                      {task.due_date && (
                        <p className="mt-0.5 text-xs text-fg-secondary">
                          {t('dueDate')}: {task.due_date}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      estado={task.status}
                      etiqueta={tRoot(statusConfig.labelKey)}
                      tono={statusConfig.tono}
                      apariencia="suave"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </Tarjeta>

        {/* Mis notificaciones */}
        <Tarjeta
          titulo={t('myNotifications')}
          icono={Bell}
          accion={
            <>
              {unreadCount > 0 && (
                <Badge tono="peligro" tamano="sm">
                  {unreadCount} {t('unread')}
                </Badge>
              )}
              <Link href="/app/notificaciones" className={CLASE_VER_TODAS}>
                {t('viewAll')}
                <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              </Link>
            </>
          }
        >
          {notifLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState compacto icono={Bell} titulo={t('noNotifications')} descripcion={t('panel.sinNotificacionesDesc')} />
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    notif.is_read_by_me ? 'border-line bg-surface' : 'border-line-brand bg-brand-tint',
                  )}
                >
                  <div className={cn('mt-1 size-2 shrink-0 rounded-full', notif.is_read_by_me ? 'bg-fg-muted' : 'bg-brand')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {notif.payload?.title || t('notification')}
                    </p>
                    {notif.payload?.content && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">
                        {notif.payload.content}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-fg-muted">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

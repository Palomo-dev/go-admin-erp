'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  User,
  CreditCard,
  Plus,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UserData } from './types';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import {
  SavedAccount,
  MAX_SAVED_ACCOUNTS,
  getSavedAccounts,
  getActiveAccountUserId,
  upsertAccountFromSession,
  removeSavedAccount,
  switchToAccount,
  initAccountRegistrySync,
  isAccountStale,
  updateSavedAccountProfile,
} from '@/lib/auth/accountSwitcher';

interface AccountSwitcherProps {
  userData: UserData | null;
  collapsed?: boolean;
}

// Limpia el estado dependiente de la cuenta anterior (organización, sucursal,
// caché de usuario) para que no queden datos de otro usuario visibles tras el cambio.
function limpiarEstadoDeSesionAnterior(): void {
  try {
    localStorage.removeItem('currentBranchId');
    sessionStorage.removeItem('currentBranchId');
    localStorage.removeItem('branchFilterAll');
    localStorage.removeItem('appLayout_userData_cache');
    localStorage.removeItem('currentOrganizationId');
    localStorage.removeItem('currentOrganizationName');
    localStorage.removeItem('organizacionActiva');
    sessionStorage.removeItem('organizacionActiva');
  } catch {
    // silencioso
  }
}

export const AccountSwitcher = ({ userData, collapsed = false }: AccountSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const t = useTranslations('nav');
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    initAccountRegistrySync();
    // Asegura que la sesión activa quede registrada aunque el usuario ya
    // estuviera autenticado antes de que existiera este selector
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) upsertAccountFromSession(data.session);
      setActiveUserId(getActiveAccountUserId());
    });

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cargar plan de suscripción (igual que el menú de perfil anterior)
  useEffect(() => {
    const loadPlan = async () => {
      try {
        const org = obtenerOrganizacionActiva();
        if (!org?.id || org.id === 0) { setPlanName(null); return; }
        const { data } = await supabase
          .from('subscriptions')
          .select('plans(name)')
          .eq('organization_id', org.id)
          .in('status', ['active', 'trialing'])
          .limit(1)
          .single();
        const planData = data as { plans?: { name?: string } } | null;
        setPlanName(planData?.plans?.name || null);
      } catch { setPlanName(null); }
    };
    loadPlan();
  }, []);

  // Refrescar la lista de cuentas cada vez que se abre el panel
  useEffect(() => {
    if (open) {
      setAccounts(getSavedAccounts());
      setActiveUserId(getActiveAccountUserId());
      setSwitchError(null);
    }
  }, [open]);

  // Cerrar al hacer click fuera (considera el botón y el panel en portal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideButton = buttonRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideButton && !insidePanel) setOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.userId !== activeUserId),
    [accounts, activeUserId]
  );

  // Las cuentas guardadas solo obtienen su nombre real cuando estuvieron activas
  // en este navegador (AppLayout lo sincroniza al cargar el perfil). Una cuenta
  // "otra" que nunca estuvo activa aquí se queda sin nombre y el panel muestra el
  // correo repetido. Al abrir el panel, resolvemos el nombre real desde `profiles`
  // para las cuentas que aún no lo tengan (permitido por RLS entre miembros de
  // organización) y persistimos el resultado en el registro local.
  useEffect(() => {
    if (!open) return;
    const pendientes = otherAccounts.filter((a) => !a.name || a.name === a.email);
    if (pendientes.length === 0) return;

    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', pendientes.map((a) => a.userId));

      if (cancelado || !data) return;
      data.forEach((perfil) => {
        const nombre = `${perfil.first_name || ''} ${perfil.last_name || ''}`.trim();
        if (nombre) {
          updateSavedAccountProfile(perfil.id, { name: nombre, avatarUrl: perfil.avatar_url || undefined });
        }
      });
      setAccounts(getSavedAccounts());
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, otherAccounts]);

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const width = Math.max(rect.width, 288);
      // El botón vive en el pie del sidebar: si no hay suficiente espacio
      // debajo, el panel se abre hacia arriba en vez de salirse de la pantalla.
      if (spaceBelow < 340) {
        setAnchorRect({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width });
      } else {
        setAnchorRect({ top: rect.bottom + 4, left: rect.left, width });
      }
    }
    setOpen((prev) => !prev);
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (account.userId === activeUserId) { setOpen(false); return; }
    setSwitchingId(account.userId);
    setSwitchError(null);
    const result = await switchToAccount(account.userId);
    if (!result.ok) {
      setSwitchError(result.error || 'No se pudo cambiar de cuenta.');
      setAccounts(getSavedAccounts());
      setSwitchingId(null);
      return;
    }
    limpiarEstadoDeSesionAnterior();
    window.location.href = '/app';
  };

  const handleRemoveAccount = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    removeSavedAccount(userId);
    setAccounts(getSavedAccounts());
  };

  const handleAddAccount = () => {
    setOpen(false);
    router.push('/auth/login?addAccount=1');
  };

  const renderAvatar = (avatarUrl: string | undefined, name: string | undefined, size: number) => {
    const resolved = avatarUrl ? getAvatarUrl(avatarUrl) : '';
    if (resolved) {
      return (
        <div className="relative overflow-hidden rounded-full flex-shrink-0" style={{ width: size, height: size }}>
          <Image src={resolved} alt={name || t('user')} fill className="object-cover" />
        </div>
      );
    }
    return (
      <div
        className="flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <User size={Math.round(size * 0.55)} />
      </div>
    );
  };

  // Cuerpo común del panel: cuentas guardadas + acciones de la cuenta activa
  const renderPanelBody = () => (
    <>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          {renderAvatar(userData?.avatar, userData?.name, 48)}
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{userData?.name || t('user')}</p>
            {userData?.email && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userData.email}</p>
            )}
            {planName && (
              <div className="flex items-center mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                <CreditCard size={12} className="mr-1" />
                <span className="truncate">{planName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {switchError && (
        <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
          {switchError}
        </div>
      )}

      {otherAccounts.length > 0 && (
        <div className="py-1 border-b border-gray-200 dark:border-gray-700">
          <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Cambiar de cuenta
          </p>
          {otherAccounts.map((account) => (
            <div
              key={account.userId}
              role="menuitem"
              onClick={() => handleSwitchAccount(account)}
              className="flex items-center px-4 py-3 sm:py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {renderAvatar(account.avatarUrl, account.name, 32)}
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1">
                  <span className="truncate">{account.name || account.email}</span>
                  {isAccountStale(account) && (
                    <AlertTriangle
                      size={12}
                      className="text-amber-500 flex-shrink-0"
                    />
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {isAccountStale(account) ? 'Sesión inactiva, puede requerir iniciar sesión de nuevo' : account.email}
                </p>
              </div>
              {switchingId === account.userId ? (
                <Loader2 size={16} className="ml-auto animate-spin text-gray-400 flex-shrink-0" />
              ) : (
                <button
                  onClick={(e) => handleRemoveAccount(e, account.userId)}
                  className="ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
                  title="Quitar cuenta de este dispositivo"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="py-1">
        <button
          onClick={handleAddAccount}
          className="flex items-center w-full px-4 py-3 sm:py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
        >
          <Plus size={16} className="mr-2" />
          Agregar otra cuenta
        </button>
        {accounts.length >= MAX_SAVED_ACCOUNTS && (
          <p className="px-4 pb-2 text-xs text-gray-400 dark:text-gray-500">
            Límite de {MAX_SAVED_ACCOUNTS} cuentas alcanzado: se quitará la más antigua.
          </p>
        )}
      </div>
    </>
  );

  const triggerButton = isMobile ? (
    <button
      ref={buttonRef}
      onClick={toggleOpen}
      className="block w-full px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors rounded-md min-h-[60px]"
    >
      <div className="flex items-center">
        {renderAvatar(userData?.avatar, userData?.name, 48)}
        <div className="ml-3 overflow-hidden flex-1">
          <p className="text-base font-medium text-gray-800 dark:text-gray-200 truncate">{userData?.name || t('user')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{userData?.role || t('user')}</p>
        </div>
        <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
      </div>
    </button>
  ) : (
    <button
      ref={buttonRef}
      onClick={toggleOpen}
      className={`block w-full px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-md ${collapsed ? 'lg:px-2 lg:text-center lg:relative lg:group' : ''}`}
    >
      <div className={`flex ${collapsed ? 'lg:justify-center' : ''} items-center`}>
        {renderAvatar(userData?.avatar, userData?.name, 40)}
        {!collapsed && (
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{userData?.name || t('user')}</p>
            <div className="flex flex-col space-y-0.5 text-xs text-gray-500 dark:text-gray-300">
              {userData?.role && <p className="truncate">{userData.role}</p>}
              {userData?.email && <p className="truncate">{userData.email}</p>}
              {planName && <p className="truncate text-blue-600 dark:text-blue-400 font-medium mt-0.5">{planName}</p>}
            </div>
          </div>
        )}
        {collapsed && (
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
            <div className="bg-gray-800 dark:bg-gray-900 text-white text-sm py-2 px-3 rounded shadow-lg min-w-[200px]">
              <div className="font-medium mb-1 text-white">{userData?.name || t('user')}</div>
              {userData?.role && <div className="text-xs text-gray-300">{userData.role}</div>}
              {userData?.email && <div className="text-xs text-gray-300 truncate">{userData.email}</div>}
            </div>
          </div>
        )}
      </div>
    </button>
  );

  return (
    <div className="relative">
      {triggerButton}

      {open && mounted && createPortal(
        isMobile ? (
          <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50">
            <div
              ref={panelRef}
              className="w-full rounded-t-2xl bg-white dark:bg-gray-800 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('myAccount')}</h3>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X size={18} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {renderPanelBody()}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={panelRef}
            className="fixed rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-[9999] max-h-[70vh] flex flex-col overflow-hidden"
            style={{
              top: anchorRect?.top,
              bottom: anchorRect?.bottom,
              left: anchorRect?.left ?? 0,
              width: anchorRect?.width ?? 288,
            }}
          >
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {renderPanelBody()}
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
};

export default AccountSwitcher;

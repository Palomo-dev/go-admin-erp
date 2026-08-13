'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isDesktop,
  getDesktopBridge,
  type DesktopAgentStatus,
  type DesktopUpdateState,
} from '@/lib/utils/desktop';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getCurrentBranchId } from '@/lib/hooks/useOrganization';

interface UseDesktopAgentReturn {
  isDesktopApp: boolean;
  agentStatus: DesktopAgentStatus | null;
  updateState: DesktopUpdateState | null;
  loading: boolean;
  error: string | null;
  startAgentForCurrentOrg: (branchIds?: number[], branchNames?: string[]) => Promise<boolean>;
  stopAgent: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useDesktopAgent(): UseDesktopAgentReturn {
  const [isDesktopApp] = useState(() => isDesktop());
  const [agentStatus, setAgentStatus] = useState<DesktopAgentStatus | null>(null);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStartAttempted = useRef(false);
  const agentRunningRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.status) return;
    try {
      const status = await bridge.status();
      setAgentStatus(status);
      agentRunningRef.current = !!status?.running;
    } catch {
      /* silencioso */
    }
  }, []);

  const startAgentForCurrentOrg = useCallback(
    async (branchIds?: number[], branchNames?: string[]) => {
      const bridge = getDesktopBridge();
      if (!bridge?.startAgent) {
        setError('Desktop bridge no disponible');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.refresh_token) {
          setError('No hay sesión activa');
          return false;
        }

        const org = obtenerOrganizacionActiva();
        if (!org.id || org.id === 0) {
          setError('No hay organización seleccionada');
          return false;
        }

        const currentBranch = getCurrentBranchId();
        const finalBranchIds = branchIds ?? (currentBranch ? [currentBranch] : []);
        const finalBranchNames = branchNames ?? (finalBranchIds.length === 1 ? ['Sucursal actual'] : []);

        if (finalBranchIds.length === 0) {
          setError('No hay sucursales seleccionadas');
          return false;
        }

        const status = await bridge.startAgent(
          sessionData.session.refresh_token,
          org.id,
          org.name || `Org ${org.id}`,
          finalBranchIds,
          finalBranchNames,
        );

        setAgentStatus(status);
        return true;
      } catch (err: any) {
        setError(err?.message || 'Error iniciando agente');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const stopAgent = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.stopAgent) return;
    try {
      const status = await bridge.stopAgent();
      setAgentStatus(status);
    } catch (err: any) {
      setError(err?.message || 'Error deteniendo agente');
    }
  }, []);

  useEffect(() => {
    if (!isDesktopApp) return;

    refreshStatus();

    const bridge = getDesktopBridge();

    if (bridge?.onAutoStarted) {
      bridge.onAutoStarted(() => {
        refreshStatus();
      });
    }

    if (bridge?.onUpdateState) {
      bridge.onUpdateState((state) => setUpdateState(state));
    }

    if (!autoStartAttempted.current) {
      autoStartAttempted.current = true;
      (async () => {
        await refreshStatus();
        if (!agentRunningRef.current) {
          await startAgentForCurrentOrg();
        }
      })();
    }

    const interval = setInterval(refreshStatus, 15_000);
    return () => clearInterval(interval);
  }, [isDesktopApp, refreshStatus, startAgentForCurrentOrg]);

  return {
    isDesktopApp,
    agentStatus,
    updateState,
    loading,
    error,
    startAgentForCurrentOrg,
    stopAgent,
    refreshStatus,
  };
}

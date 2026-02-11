"use client";

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getOptimizedSession, refreshSessionToken, clearSessionCache, performHealthCheck } from '../supabase/auth-manager';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { Session } from '@supabase/supabase-js';

// Constants for session management
// TEMPORALMENTE DESHABILITADO: Conflicto con middleware
// 
// PROBLEMA: Había conflicto entre dos sistemas de expiración:
// 1. Middleware: Verifica expiración real de sesión de Supabase
// 2. SessionContext: Verifica inactividad del usuario (10 min)
// 
// SÍNTOMA: Usuario inactivo → SessionContext redirige a /auth/session-expired
//          → Middleware detecta sesión válida → Permite acceso a /app/inicio
//          → App queda en "stand by" sin redirección clara
// 
// SOLUCIÓN TEMPORAL: Deshabilitar inactividad hasta implementar solución unificada
// const INACTIVITY_THRESHOLD = 10 * 60 * 1000; // 10 minutes in milliseconds
const INACTIVITY_THRESHOLD = Infinity; // Deshabilitar inactividad temporalmente
const COUNTDOWN_DURATION = 60; // 60 seconds countdown
const LOCAL_STORAGE_LAST_ACTIVITY = 'last-activity-time';

// Types
type SessionState = {
  session: Session | null;
  loading: boolean;
  inactivityTime: number; // Time in ms since last activity
  showRenewalPopup: boolean;
  countdown: number; // Countdown in seconds
  isActive: boolean; // Whether the user is currently active
};

type SessionContextType = {
  session: Session | null;
  loading: boolean;
  showRenewalPopup: boolean;
  countdown: number;
  isActive: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  updateLastActivityTime: () => void;
  dismissRenewalPopup: () => void;
};

// Create context with default values
const SessionContext = createContext<SessionContextType>({
  session: null,
  loading: true,
  showRenewalPopup: false,
  countdown: COUNTDOWN_DURATION,
  isActive: true,
  refreshSession: async () => {},
  logout: async () => {},
  updateLastActivityTime: () => {},
  dismissRenewalPopup: () => {},
});

// Custom hook to use the session context
export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  
  // Session state
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: true,
    inactivityTime: 0,
    showRenewalPopup: false,
    countdown: COUNTDOWN_DURATION,
    isActive: true,
  });
  
  // User activity tracking
  const updateLastActivityTime = useCallback(() => {
    const now = Date.now();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(LOCAL_STORAGE_LAST_ACTIVITY, now.toString());
      
      // Update state
      setState(prev => ({
        ...prev,
        inactivityTime: 0,
        isActive: true,
        showRenewalPopup: false,
        countdown: COUNTDOWN_DURATION,
      }));
    }
  }, []);
  
  // Setup activity listeners
  useEffect(() => {
    // Initialize last activity time if not set
    if (typeof window !== 'undefined' && !sessionStorage.getItem(LOCAL_STORAGE_LAST_ACTIVITY)) {
      updateLastActivityTime();
    }
    
    // Add event listeners for user activity
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const trackActivity = () => updateLastActivityTime();
    
    activityEvents.forEach(event => {
      window.addEventListener(event, trackActivity, { passive: true });
    });
    
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, trackActivity);
      });
    };
  }, [updateLastActivityTime]);
  
  // Check for inactivity
  useEffect(() => {
    if (!state.session) return;
    
    const checkInactivity = () => {
      if (typeof window === 'undefined') return;
      
      const lastActivityStr = sessionStorage.getItem(LOCAL_STORAGE_LAST_ACTIVITY);
      if (!lastActivityStr) {
        updateLastActivityTime();
        return;
      }
      
      const lastActivity = parseInt(lastActivityStr, 10);
      const now = Date.now();
      const inactiveTime = now - lastActivity;
      
      setState(prev => ({
        ...prev,
        inactivityTime: inactiveTime,
        isActive: inactiveTime < INACTIVITY_THRESHOLD,
        // Show popup if inactive but not showing already
        showRenewalPopup: inactiveTime >= INACTIVITY_THRESHOLD && !prev.showRenewalPopup ? true : prev.showRenewalPopup,
      }));
    };
    
    // Check inactivity every 30 seconds
    const intervalId = setInterval(checkInactivity, 30000);
    return () => clearInterval(intervalId);
  }, [state.session, updateLastActivityTime]);
  
  // Countdown timer for session expiry
  useEffect(() => {
    if (!state.showRenewalPopup) return;
    
    let countdownTimer: NodeJS.Timeout;
    
    if (state.countdown > 0) {
      countdownTimer = setInterval(() => {
        setState(prev => ({
          ...prev,
          countdown: prev.countdown - 1,
        }));
      }, 1000);
    } else {
      // Logout when countdown reaches zero
      handleLogout();
    }
    
    return () => {
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, [state.showRenewalPopup, state.countdown]);
  
  // Fetch initial session
  useEffect(() => {
    const initSession = async () => {
      try {
        const { session, error } = await getOptimizedSession();
        
        if (error) {
          console.error('Error initializing session:', error);
          setState(prev => ({ ...prev, loading: false, session: null }));
          return;
        }
        
        // Update session state
        setState(prev => ({ ...prev, loading: false, session }));
        
        // Schedule health checks
        setTimeout(() => {
          performHealthCheck();
        }, 5000);
        
      } catch (err) {
        console.error('Session initialization error:', err);
        setState(prev => ({ ...prev, loading: false, session: null }));
      }
    };
    
    initSession();
  }, []);
  
  // Function to refresh session
  const refreshSession = async () => {
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const { session, error } = await refreshSessionToken();
      
      if (error) {
        console.error('Error refreshing session:', error);
        toast({
          title: 'Error de sesión',
          description: 'No se pudo renovar la sesión. Por favor, inicie sesión nuevamente.',
          variant: 'destructive',
        });
        return;
      }
      
      // Reset inactivity tracking
      updateLastActivityTime();
      
      // Update session state
      setState(prev => ({
        ...prev,
        loading: false,
        session,
        showRenewalPopup: false,
        countdown: COUNTDOWN_DURATION,
      }));
      
      toast({
        title: 'Sesión renovada',
        description: 'Su sesión ha sido renovada exitosamente.',
        variant: 'default',
      });
    } catch (err) {
      console.error('Session refresh error:', err);
      setState(prev => ({ ...prev, loading: false }));
      toast({
        title: 'Error de sesión',
        description: 'Error al renovar la sesión. Por favor, inicie sesión nuevamente.',
        variant: 'destructive',
      });
    }
  };
  
  // Function to handle logout
  const handleLogout = async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      // Clear session cache and sign out from Supabase
      await clearSessionCache();
      
      // Update state immediately
      setState(prev => ({ 
        ...prev, 
        loading: false,
        session: null,
        showRenewalPopup: false,
        countdown: COUNTDOWN_DURATION,
      }));
      
      // Dispatch session expiration event
      const sessionExpiredEvent = new CustomEvent('session:expired', {
        detail: { reason: 'logout' }
      });
      window.dispatchEvent(sessionExpiredEvent);
      
      // Redirect to login page
      router.push('/auth/login');
      
    } catch (err) {
      console.error('Logout error:', err);
      setState(prev => ({ 
        ...prev, 
        loading: false,
        session: null,
        showRenewalPopup: false,
        countdown: COUNTDOWN_DURATION,
      }));
      // Still redirect to login even on error
      router.push('/auth/login');
    }
  };
  
  // Function to dismiss renewal popup and renew session
  const dismissRenewalPopup = () => {
    setState(prev => ({
      ...prev,
      showRenewalPopup: false,
      countdown: COUNTDOWN_DURATION,
    }));
    
    // Renew session
    refreshSession();
  };
  
  // Context value
  const value = {
    session: state.session,
    loading: state.loading,
    showRenewalPopup: state.showRenewalPopup,
    countdown: state.countdown,
    isActive: state.isActive,
    refreshSession,
    logout: handleLogout,
    updateLastActivityTime,
    dismissRenewalPopup,
  };
  
  return (
    <SessionContext.Provider value={value}>
      {children}
      {state.showRenewalPopup && <SessionRenewalPopup 
        countdown={state.countdown} 
        onRenew={dismissRenewalPopup}
        onCancel={handleLogout}
      />}
    </SessionContext.Provider>
  );
};

// SessionRenewalPopup component
export const SessionRenewalPopup: React.FC<{
  countdown: number;
  onRenew: () => void;
  onCancel: () => void;
}> = ({ countdown, onRenew, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg max-w-md w-full">
        <h2 className="text-xl font-bold mb-2">Su sesión está por expirar</h2>
        <p className="mb-4">
          Por inactividad, su sesión expirará en <span className="font-bold text-red-500">{countdown}</span> segundos.
        </p>
        
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cerrar sesión
          </button>
          <button
            onClick={onRenew}
            className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            Continuar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionProvider;

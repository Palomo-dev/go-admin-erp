import { supabase, ensureSessionSynced } from '@/lib/supabase/config';
import { guardarOrganizacionActiva, invalidateBranchIdCache } from '@/lib/hooks/useOrganization';

// Define Organization type
export interface Organization {
  id: number;
  name: string;
  type_id: {
    name: string;
  };
  role_id?: number;
  logo_url?: string;
  plan?: {
    id: number;
    name: string
  };
  plan_id?: {
    name: string;
  };
  status?: string; // Campo para indicar si la organización está activa o inactiva
}

export interface SelectOrganizationParams {
  organization: Organization;
  email?: string;
  rememberMe?: boolean;
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (rememberMe: boolean, email: string) => void;
}

export const selectOrganizationFromPopup = async ({
  organization,
  email = '',
  rememberMe = false,
  setShowOrgPopup,
  proceedWithLogin
}: SelectOrganizationParams) => {
  console.log('🏢 [DEBUG] selectOrganizationFromPopup iniciado:', {
    organizationId: organization.id,
    organizationName: organization.name,
    email
  });
  
  setShowOrgPopup(false);
  
  // Limpiar caches stale de la organización anterior
  localStorage.removeItem('appLayout_userData_cache');
  localStorage.removeItem('currentBranchId');
  sessionStorage.removeItem('currentBranchId');
  invalidateBranchIdCache();
  
  // Guardar organización usando la función centralizada (guarda en organizacionActiva + sessionStorage)
  guardarOrganizacionActiva({
    id: organization.id,
    name: organization.name,
    logo_url: organization.logo_url
  });
  
  // También mantener compatibilidad con las claves legacy
  localStorage.setItem('currentOrganizationId', organization.id.toString());
  localStorage.setItem('currentOrganizationName', organization.name);
  
  console.log('💾 [DEBUG] Organización guardada en localStorage:', {
    currentOrganizationId: localStorage.getItem('currentOrganizationId'),
    currentOrganizationName: localStorage.getItem('currentOrganizationName')
  });
  
  console.log('🚀 [DEBUG] Llamando proceedWithLogin...');
  
  // Continue with login process
  try {
    await proceedWithLogin(rememberMe, email);
    console.log('✅ [DEBUG] proceedWithLogin completado exitosamente');
  } catch (error) {
    console.error('❌ [DEBUG] Error en proceedWithLogin:', error);
  }
};


export const proceedWithLogin = async (rememberMe: boolean = false, email: string = '') => {
  console.log(' [DEBUG] proceedWithLogin iniciado:', { rememberMe, email });
  
  // Obtener la sesión actual
  let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  
  console.log(' [DEBUG] Session data obtenida:', {
    hasSession: !!sessionData.session,
    hasUser: !!sessionData.session?.user,
    userId: sessionData.session?.user?.id
  });

  if (sessionError || !sessionData.session) {
    console.error(' [DEBUG] Error obteniendo sesión o sesión vacía:', sessionError);
    throw new Error('No se pudo obtener la información de la sesión');
  }
  
  // La sesión ya está autenticada y establecida
  console.log('✅ [DEBUG] Usando sesión activa. Saltando refresh para evitar problemas.');
  
  // Verificar inmediatamente que tenemos la sesión
  console.log('🔍 [DEBUG] Datos de sesión actuales:', {
    hasSession: !!sessionData.session,
    userId: sessionData.session?.user?.id,
    userEmail: sessionData.session?.user?.email
  });
  
  // Verificar que tenemos una sesión válida con múltiples intentos
  let retryCount = 0;
  const maxRetries = 5; // Hasta 5 intentos
  
  while (!sessionData?.session?.user && retryCount < maxRetries) {
    console.log(` [DEBUG] Intento ${retryCount + 1}/${maxRetries}: Esperando sesión de usuario...`);
    
    // Esperar más tiempo en cada retry
    await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
    
    const { data: retrySessionData, error: retryError } = await supabase.auth.getSession();
    console.log(` [DEBUG] Retry ${retryCount + 1} resultado:`, {
      hasSession: !!retrySessionData?.session,
      hasUser: !!retrySessionData?.session?.user,
      userId: retrySessionData?.session?.user?.id,
      retryError
    });
    
    if (retrySessionData?.session?.user) {
      sessionData = retrySessionData;
      console.log(' [DEBUG] Sesión obtenida exitosamente en intento:', retryCount + 1);
      break;
    }
    
    retryCount++;
  }
  
  // Si después de todos los intentos no hay sesión, intentar una última estrategia
  if (!sessionData?.session?.user) {
    console.error(' [DEBUG] No se pudo obtener la sesión después de', maxRetries, 'intentos');
    
    // Estrategia final: verificar si el email fue confirmado pero no hay sesión
    console.log('� Verificando si es un problema de sesión perdida...');
    
    try {
      // Intentar hacer login con el email que acabamos de confirmar
      if (email) {
        console.log('�🔄 Intentando recuperar sesión para email:', email);
        
        // Primero verificar si existe el usuario y está confirmado
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', email)
          .single();
        
        if (!userError && userData) {
          console.log('✅ Usuario encontrado en perfiles, redirigiendo a login con contexto...');
          
          // Guardar contexto para el login
          sessionStorage.setItem('emailJustConfirmed', email);
          sessionStorage.setItem('redirectTo', '/app/inicio');
          
          // Redirigir a login con mensaje
          setTimeout(() => {
            window.location.replace(`/auth/login?email=${encodeURIComponent(email)}&confirmed=true`);
          }, 1000);
          
          return;
        }
      }
    } catch (error) {
      console.error('Error en verificación final:', error);
    }
    
    // Limpiar cualquier estado corrupto
    localStorage.removeItem('currentOrganizationId');
    localStorage.removeItem('currentOrganizationName');
    
    console.log('🔄 Redirigiendo a login para reintentar...');
    // Redirigir a login después de un breve delay
    setTimeout(() => {
      window.location.replace('/auth/login');
    }, 2000);
    
    return;
  }
  
  console.log('✅ [DEBUG] Sesión válida encontrada para:', sessionData.session.user.email);
  console.log('🔍 [DEBUG] User ID de la sesión:', sessionData.session.user.id);
  
  // Verificar que el perfil del usuario esté creado antes de continuar
  console.log('🔍 [DEBUG] Verificando perfil de usuario...');
  let profileExists = false;
  let profileRetries = 0;
  const maxProfileRetries = 3;
  
  while (!profileExists && profileRetries < maxProfileRetries) {
    try {
      console.log(`🔍 [DEBUG] Buscando perfil - intento ${profileRetries + 1}/${maxProfileRetries}`);
      
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, last_org_id, status')
        .eq('id', sessionData.session.user.id)
        .single();
      
      console.log('🔍 [DEBUG] Resultado búsqueda perfil:', {
        profileData,
        profileError,
        hasData: !!profileData
      });
      
      if (!profileError && profileData) {
        profileExists = true;
        console.log('✅ [DEBUG] Perfil encontrado:', {
          email: profileData.email,
          status: profileData.status,
          lastOrgId: profileData.last_org_id
        });
        
        // Si el perfil tiene una organización, usarla
        if (profileData.last_org_id) {
          localStorage.setItem('currentOrganizationId', profileData.last_org_id.toString());
          console.log('✅ [DEBUG] Organización del perfil cargada:', profileData.last_org_id);
        }
      } else {
        console.log(`⏳ [DEBUG] Intento ${profileRetries + 1}/${maxProfileRetries}: Perfil no encontrado`, profileError);
        await new Promise(resolve => setTimeout(resolve, 2000));
        profileRetries++;
      }
    } catch (error) {
      console.error('❌ [DEBUG] Error verificando perfil:', error);
      profileRetries++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (!profileExists) {
    console.warn('⚠️ No se encontró perfil después de', maxProfileRetries, 'intentos. Continuando...');
  }

  // Update user's last organization if we have a current organization ID
  const orgId = localStorage.getItem('currentOrganizationId');
  
  if (orgId && sessionData?.session?.user) {
    try {
      console.log('🔄 Actualizando perfil con organización ID:', orgId);
      
      // Update the user's profile with the selected organization
      const { data: updateData, error: profUpdate } = await supabase
        .from('profiles')
        .update({ last_org_id: parseInt(orgId) })
        .eq('id', sessionData.session.user.id);
      
      if (profUpdate) {
        console.error('❌ Error updating user profile with organization:', profUpdate);
        // No abortar por este error, continuar con el proceso
      } else {
        console.log('✅ Successfully updated user profile with organization ID:', orgId);
      }
      
      // Also fetch organization details to store in local storage
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('name, type_id, organization_types:organization_types!fk_organizations_organization_type(name)')
        .eq('id', parseInt(orgId))
        .single();
      
      if (!orgError && orgData) {
        // Store additional organization details
        // Access organization type safely with type assertion
        let orgTypeName = 'Unknown';
        
        // Log the structure to help debug
        console.log('Organization data:', orgData);
        
        try {
          // Handle different possible structures of the returned data
          if (orgData.organization_types) {
            const orgTypes = orgData.organization_types as any;
            if (typeof orgTypes === 'object') {
              if (orgTypes.name) {
                orgTypeName = orgTypes.name;
              }
            }
          }
        } catch (e) {
          console.error('Error extracting organization type:', e);
        }
        
        localStorage.setItem('currentOrganizationType', orgTypeName);
      }
    } catch (error) {
      console.error('Error in organization profile update:', error);
    }
  }

  // Simple function to obfuscate email (not true encryption but better than plaintext)
  // Debe usar la misma ofuscación que page.tsx: btoa(email).split('').reverse().join('')
  const obfuscateEmail = (email: string): string => {
    return btoa(email).split('').reverse().join('');
  };
  
  // Simple function to deobfuscate email
  const deobfuscateEmail = (obfuscated: string): string => {
    try {
      return atob(obfuscated).split('').reverse().join('');
    } catch (e) {
      return '';
    }
  };
  
  // Add to window for use in other components
  if (typeof window !== 'undefined') {
    (window as any).deobfuscateEmail = deobfuscateEmail;
  }
  
  if (rememberMe) {
    localStorage.setItem('rememberMe', 'true');
    // Store email with simple obfuscation instead of plaintext
    localStorage.setItem('userEmail', obfuscateEmail(email));
  } else {
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('userEmail');
  }

  // Check if there's a redirectTo in session storage
  const redirectTo = sessionStorage.getItem('redirectTo');

  // Registrar el dispositivo en la base de datos
  if (sessionData?.session?.user?.id) {
    // Marcar como pendiente por si el fetch falla (dev server reinicio, red, etc.)
    localStorage.setItem('pendingDeviceRegister', sessionData.session.user.id);
    registerUserDevice(sessionData.session.user.id).catch(error => {
      localStorage.setItem('registerDeviceError', JSON.stringify(error));
      console.error('Error al registrar el dispositivo:', error);
    }).finally(() => {
      // Si tuvo éxito (o falló definitivamente), limpiar el flag
      // Se limpia en finally para que el retry post-redirect no se quede colgado
      localStorage.removeItem('pendingDeviceRegister');
    });
  } else {
    console.warn('No se pudo registrar el dispositivo: no hay userId disponible');
  }
  
  // Obtener el projectRef para logging
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.split('.')[0].replace('https://', '');
  
  // La sesión ya fue establecida con setSession() arriba
  // Supabase debería manejar las cookies automáticamente
  console.log('✅ [DEBUG] Sesión establecida. Supabase debe manejar las cookies automáticamente.');
  
  // Verificar que la cookie de Supabase esté presente
  setTimeout(() => {
    const allCookies = document.cookie;
    console.log('🔍 [DEBUG] Verificando cookies establecidas:', {
      allCookies: allCookies.split(';').map(c => c.trim().split('=')[0]),
      totalCookies: allCookies.split(';').length
    });
  }, 500);

  // Para depuración, agregar una cookie con información del usuario
  document.cookie = `go-admin-user-id=${sessionData.session?.user?.id || ''}; path=/; max-age=604800; SameSite=Lax`;
  
  // Registrar en consola para depuración
  console.log('✅ [DEBUG] Sesión establecida correctamente', sessionData.session.user?.email);
  console.log('🍪 [DEBUG] Auth cookie esperada:', `sb-${projectRef}-auth-token`);
  console.log('⏰ [DEBUG] Expiración de sesión:', new Date((sessionData.session.expires_at || 0) * 1000).toLocaleString());
  
  console.log('🚀 [DEBUG] Preparando redirección en 1 segundo...');
  console.log('🔍 [DEBUG] redirectTo desde sessionStorage:', redirectTo);
  
  setTimeout(async () => {
    try {
      console.log('🔍 [DEBUG] Verificando sesión antes de redirección:', {
        hasSession: !!sessionData.session,
        hasUser: !!sessionData.session?.user,
        userId: sessionData.session?.user?.id,
        userEmail: sessionData.session?.user?.email
      });
      
      if (sessionData.session) {
        // Forzar sincronización de cookies antes de redireccionar
        console.log('🔄 [DEBUG] Sincronizando sesión antes de redireccionar...');
        const sessionSynced = await ensureSessionSynced();
        
        if (sessionSynced) {
          console.log('✅ [DEBUG] Sesión sincronizada exitosamente');
        } else {
          console.warn('⚠️ [DEBUG] Advertencia: No se pudo sincronizar completamente la sesión');
        }
        
        // Pequeño delay adicional para asegurar que las cookies se establezcan
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (redirectTo) {
          console.log('🚀 [DEBUG] Redirigiendo a redirectTo:', redirectTo);
          sessionStorage.removeItem('redirectTo');
          window.location.replace(redirectTo);
        } else {
          console.log('🚀 [DEBUG] Redirigiendo a dashboard por defecto: /app/inicio');
          window.location.replace('/app/inicio');
        }
      } else {
        console.error('❌ [DEBUG] No se pudo establecer la sesión correctamente');
        window.location.replace('/auth/login?error=session-failed');
      }
    } catch (redirectError) {
      console.error('❌ [DEBUG] Error al redireccionar:', redirectError);
      window.location.replace('/auth/login?error=redirect-failed');
    }
  }, 1000);
};

// Función para registrar el dispositivo del usuario
export const registerUserDevice = async (sessionOrUserId: any) => {
  try {
    // Determinar si es una sesión completa o solo un userId
    let userId: string;
    if (typeof sessionOrUserId === 'string' && sessionOrUserId.trim() !== '') {
      // Es solo un userId
      userId = sessionOrUserId;
    } else if (sessionOrUserId && sessionOrUserId.user && sessionOrUserId.user.id) {
      // Es una sesión completa
      userId = sessionOrUserId.user.id;
    } else {
      console.error('Parámetro no válido para registrar dispositivo:', {
        type: typeof sessionOrUserId,
        value: sessionOrUserId,
        hasUser: sessionOrUserId?.user,
        hasUserId: sessionOrUserId?.user?.id
      });
      throw new Error('No se pudo obtener el ID de usuario para registrar el dispositivo');
    }

    // Obtener información del dispositivo
    const userAgent = window.navigator.userAgent;
    const deviceName = detectDeviceName(userAgent);
    const deviceType = detectDeviceType(userAgent);
    
    // Obtener más detalles del navegador y sistema operativo
    const browserInfo = detectBrowserInfo();
    
    // Generar una huella digital simple del dispositivo
    const deviceFingerprint = await generateDeviceFingerprint();
    
    // Obtener ubicación del navegador según preferencia guardada
    const { getLocationFromBrowser } = await import('@/lib/utils/geolocation')
    const location = await getLocationFromBrowser()
    
    // Preparar los datos para la API
    const deviceData = {
      user_id: userId,
      device_name: deviceName,
      device_type: deviceType,
      user_agent: userAgent,
      browser: browserInfo.browser,
      browser_version: browserInfo.browserVersion,
      os: browserInfo.os,
      os_version: browserInfo.osVersion,
      device_fingerprint: deviceFingerprint,
      location: location, // Incluir ubicación si está disponible
      // La IP se captura en el servidor
      is_active: true,
      first_seen_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    };

    console.log('Registrando dispositivo:', deviceData);

    // Usar el cliente Supabase directamente (evita error 431 por cookies chunked grandes)
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.user?.id) {
      console.warn('No hay sesión activa para registrar dispositivo');
      return;
    }

    // Buscar si ya existe un dispositivo con esta huella digital
    const { data: existingDevice } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle();

    if (existingDevice) {
      // Actualizar último acceso
      const { error: updateError } = await supabase
        .from('user_devices')
        .update({
          last_active_at: new Date().toISOString(),
          is_active: true,
          revoked_at: null,
          user_agent: userAgent,
          browser: browserInfo.browser,
          browser_version: browserInfo.browserVersion,
          os: browserInfo.os,
          os_version: browserInfo.osVersion,
        })
        .eq('id', existingDevice.id);

      if (updateError) throw updateError;
      console.log('Dispositivo actualizado exitosamente:', existingDevice.id);
    } else {
      // Insertar nuevo dispositivo
      const { error: insertError } = await supabase
        .from('user_devices')
        .insert({
          user_id: userId,
          session_id: userId,
          device_name: deviceName,
          device_type: deviceType,
          device_fingerprint: deviceFingerprint,
          user_agent: userAgent,
          browser: browserInfo.browser,
          browser_version: browserInfo.browserVersion,
          os: browserInfo.os,
          os_version: browserInfo.osVersion,
          location: location,
          is_active: true,
          is_trusted: false,
          first_seen_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      console.log('Dispositivo registrado exitosamente');
    }
  } catch (error) {
    console.error('Error al registrar el dispositivo:', error);
  }
};

// Detectar nombre del dispositivo basado en el user agent
const detectDeviceName = (userAgent: string): string => {
  // Detectar dispositivo
  if (userAgent.includes('iPhone')) {
    return 'iPhone';
  } else if (userAgent.includes('iPad')) {
    return 'iPad';
  } else if (userAgent.includes('Mac')) {
    return 'Mac';
  } else if (userAgent.includes('Windows Phone')) {
    return 'Windows Phone';
  } else if (userAgent.includes('Android') && userAgent.includes('Mobile')) {
    // Intentar detectar marca de Android
    const androidMatch = userAgent.match(/Android [\d\.]+; ([^;]+);/);
    if (androidMatch && androidMatch[1]) {
      return `Android - ${androidMatch[1]}`;
    }
    return 'Android Phone';
  } else if (userAgent.includes('Android')) {
    return 'Android Tablet';
  } else if (userAgent.includes('Windows')) {
    return 'Windows PC';
  } else if (userAgent.includes('Linux')) {
    return 'Linux PC';
  }
  
  return 'Dispositivo desconocido';
};

// Detectar tipo de dispositivo
const detectDeviceType = (userAgent: string): string => {
  if (userAgent.includes('iPhone') || (userAgent.includes('Android') && userAgent.includes('Mobile')) || userAgent.includes('Windows Phone')) {
    return 'smartphone';
  } else if (userAgent.includes('iPad') || userAgent.includes('Tablet') || (userAgent.includes('Android') && !userAgent.includes('Mobile'))) {
    return 'tablet';
  } else if (userAgent.includes('Windows') || userAgent.includes('Macintosh') || userAgent.includes('Linux') && !userAgent.includes('Android')) {
    return 'desktop';
  } else {
    return 'unknown';
  }
};

// Detectar información detallada del navegador
const detectBrowserInfo = () => {
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const browserInfo: {[key: string]: any} = {
    browser: 'unknown',
    browserVersion: 'unknown',
    os: 'unknown',
    osVersion: 'unknown',
    device: 'unknown',
  };
  
  // Detectar navegador y versión
  if (ua.includes('Firefox/')) {
    browserInfo.browser = 'Firefox';
    const version = ua.match(/Firefox\/(\d+\.\d+)/);
    if (version) browserInfo.browserVersion = version[1];
  } else if (ua.includes('Edg/')) {
    browserInfo.browser = 'Edge';
    const version = ua.match(/Edg\/(\d+\.\d+)/);
    if (version) browserInfo.browserVersion = version[1];
  } else if (ua.includes('Chrome/')) {
    browserInfo.browser = 'Chrome';
    const version = ua.match(/Chrome\/(\d+\.\d+)/);
    if (version) browserInfo.browserVersion = version[1];
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browserInfo.browser = 'Safari';
    const version = ua.match(/Version\/(\d+\.\d+)/);
    if (version) browserInfo.browserVersion = version[1];
  } else if (ua.includes('OPR/') || ua.includes('Opera')) {
    browserInfo.browser = 'Opera';
    const version = ua.match(/(?:OPR|Opera)\/(\d+\.\d+)/);
    if (version) browserInfo.browserVersion = version[1];
  }
  
  // Detectar sistema operativo y versión
  if (ua.includes('Windows')) {
    browserInfo.os = 'Windows';
    if (ua.includes('Windows NT 10.0')) browserInfo.osVersion = '10/11';
    else if (ua.includes('Windows NT 6.3')) browserInfo.osVersion = '8.1';
    else if (ua.includes('Windows NT 6.2')) browserInfo.osVersion = '8';
    else if (ua.includes('Windows NT 6.1')) browserInfo.osVersion = '7';
    else browserInfo.osVersion = 'Otro';
  } else if (ua.includes('Mac OS X')) {
    browserInfo.os = 'MacOS';
    const version = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (version) browserInfo.osVersion = version[1].replace('_', '.');
  } else if (ua.includes('Android')) {
    browserInfo.os = 'Android';
    const version = ua.match(/Android (\d+\.\d+)/);
    if (version) browserInfo.osVersion = version[1];
  } else if (ua.includes('iOS')) {
    browserInfo.os = 'iOS';
    const version = ua.match(/OS (\d+_\d+)/);
    if (version) browserInfo.osVersion = version[1].replace('_', '.');
  } else if (ua.includes('Linux')) {
    browserInfo.os = 'Linux';
  }
  
  return browserInfo;
};

// Generar huella digital simple del dispositivo
const generateDeviceFingerprint = async (): Promise<string> => {
  const components = [
    window.navigator.userAgent,
    window.navigator.language,
    window.screen.colorDepth,
    window.screen.width + 'x' + window.screen.height,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    !!window.indexedDB,
  ];
  
  const fingerprint = components.join('###');
  
  // Crear hash usando SubtleCrypto si está disponible
  if (window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(fingerprint);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback si falla la API de Crypto
      return btoa(fingerprint).substring(0, 64);
    }
  } else {
    // Fallback para navegadores que no soportan SubtleCrypto
    return btoa(fingerprint).substring(0, 64);
  }
};

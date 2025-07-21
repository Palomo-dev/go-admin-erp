import { supabase } from '@/lib/supabase/config';

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
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (rememberMe: boolean, email: string) => void;
}

export const selectOrganizationFromPopup = async ({
  organization,
  email = '',
  setShowOrgPopup,
  proceedWithLogin
}: SelectOrganizationParams) => {
  setShowOrgPopup(false);
  
  // Save organization info to localStorage
  localStorage.setItem('currentOrganizationId', organization.id.toString());
  localStorage.setItem('currentOrganizationName', organization.name);
  
  // Continue with login process
  proceedWithLogin(false, email);
};


export const proceedWithLogin = async (rememberMe: boolean = false, email: string = '') => {
  // Set remember me preference in local storage if checked
  const { data: sessionData } = await supabase.auth.getSession();
  
  // Update user's last organization if we have a current organization ID
  const orgId = localStorage.getItem('currentOrganizationId');
  
  if (orgId && sessionData?.session?.user) {
    try {
      // Update the user's profile with the selected organization
      const { data: updateData, error: profUpdate } = await supabase
        .from('profiles')
        .update({ last_org_id: parseInt(orgId) })
        .eq('id', sessionData.session.user.id);
      
      if (profUpdate) {
        console.error('Error updating user profile with organization:', profUpdate);
      } else {
        console.log('Successfully updated user profile with organization ID:', orgId);
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
  const obfuscateEmail = (email: string): string => {
    return btoa(email.split('').reverse().join(''));
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
  registerUserDevice(sessionData.session).catch(error => {
    localStorage.setItem('registerDeviceError', JSON.stringify(error));
    console.error('Error al registrar el dispositivo:', error);
  });
  
  // Forzar a Supabase a persistir la sesión correctamente
  supabase.auth.refreshSession().then(() => {
    // Verificar que la sesión se haya establecido correctamente
    supabase.auth.getSession().then(({ data: sessionData }) => {
      // No almacenar tokens en localStorage por razones de seguridad
      // En su lugar, usar cookies HTTP-only para los tokens de autenticación
      if (sessionData.session) {
        // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.split('.')[0].replace('https://', '');
        
        // Preparar los datos de sesión completos para la cookie
        // Esto es crucial: Supabase espera el objeto completo, no solo el token
        const sessionValue = JSON.stringify({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: sessionData.session.expires_at,
          user: sessionData.session.user
        });
        
        // Cookie específica del proyecto usando la referencia dinámica
        // Esta es la cookie principal que usará Supabase para autenticar
        if (projectRef) {
          // Usamos configuraciones compatibles con la protección CSRF
          // No establecemos HttpOnly aquí porque Supabase necesita acceder a esta cookie desde JavaScript
          document.cookie = `sb-${projectRef}-auth-token=${encodeURIComponent(sessionValue)}; path=/; max-age=604800; SameSite=Lax`;
        }
        
        // Para depuración, agregar una cookie con información del usuario
        document.cookie = `go-admin-user-id=${sessionData.session?.user?.id || ''}; path=/; max-age=604800; SameSite=Lax`;
        
        // Registrar en consola para depuración
        console.log('Sesión establecida correctamente', sessionData.session.user?.email);
        console.log('Auth cookie configurada:', `sb-${projectRef}-auth-token`);
        console.log('Expiración de sesión:', new Date((sessionData.session.expires_at || 0) * 1000).toLocaleString());
        
        
      } else {
        console.error('No hay datos de sesión disponibles en la respuesta de refreshSession');
      }
      
      setTimeout(() => {
        try {
          if (sessionData.session) {
            if (redirectTo) {
              sessionStorage.removeItem('redirectTo');
              window.location.replace(redirectTo);
            } else {
              // Redirect to dashboard on successful login
              window.location.replace('/app/inicio');
            }
          } else {
            console.error('No se pudo establecer la sesión correctamente');
            alert('Error al establecer la sesión. Por favor, intenta nuevamente.');
          }
        } catch (redirectError) {
          console.error('Error al redireccionar:', redirectError);
          alert('Error al redireccionar. Por favor, intenta nuevamente.');
        }
      }, 1000);
    });
  });
};

// Función para registrar el dispositivo del usuario
export const registerUserDevice = async (sessionOrUserId: any) => {
  try {
    // Determinar si es una sesión completa o solo un userId
    let userId: string;
    if (typeof sessionOrUserId === 'string') {
      // Es solo un userId
      userId = sessionOrUserId;
    } else if (sessionOrUserId && sessionOrUserId.user && sessionOrUserId.user.id) {
      // Es una sesión completa
      userId = sessionOrUserId.user.id;
    } else {
      console.error('Parámetro no válido para registrar dispositivo');
      return;
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
    
    // Llamar al endpoint API para registrar/actualizar el dispositivo
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deviceData),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result = await response.json();
    console.log('Dispositivo registrado exitosamente:', result);
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

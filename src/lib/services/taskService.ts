'use client';

import { supabase } from '@/lib/supabase/config';
import { Task, NewTask, TaskStatus, TaskType, TaskFilter, TaskStatusUI, TaskHierarchy, SubtaskStats } from '@/types/task';
import { getOrganizationId, getCurrentUserId } from "@/lib/hooks/useOrganization";
import Logger from '@/lib/utils/logger';
import { generateTaskNotifications } from './notificationService';

/**
 * Obtiene el rol del usuario actual
 * @returns Rol del usuario o null si no se puede obtener
 */
const getCurrentUserRole = async (): Promise<string | null> => {
  try {
    // Verificar sesión de autenticación primero
    const { data: sessionData } = await supabase.auth.getSession();
    Logger.debug('TASKS', 'Estado de sesión:', {
      session: !!sessionData?.session,
      user: !!sessionData?.session?.user,
      userId: sessionData?.session?.user?.id
    });
    
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      Logger.warn('TASKS', 'No se pudo obtener el ID del usuario actual');
      // Intentar obtener directamente de la sesión
      const fallbackUserId = sessionData?.session?.user?.id;
      if (fallbackUserId) {
        Logger.debug('TASKS', `Usando fallback user ID: ${fallbackUserId}`);
        // Continuar con el fallback
      } else {
        Logger.error('TASKS', 'No hay usuario autenticado');
        return null;
      }
    }

    const userId = currentUserId || sessionData?.session?.user?.id;
    Logger.debug('TASKS', `Obteniendo rol para usuario: ${userId}`);
    
    // Verificar si el usuario existe en organization_members
    Logger.debug('TASKS', 'Consultando organization_members...');
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('role_id, organization_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    Logger.debug('TASKS', `Resultado consulta membresía:`, { memberData, memberError });
    
    if (memberError) {
      Logger.error('TASKS', 'Error en consulta de membresía:', memberError);
      return null;
    }
    
    if (!memberData || memberData.length === 0) {
      Logger.warn('TASKS', `Usuario ${userId} no encontrado en organization_members o no está activo`);
      
      // Intentar sin filtro de is_active para debugging
      const { data: allMemberData } = await supabase
        .from('organization_members')
        .select('role_id, organization_id, is_active')
        .eq('user_id', userId);
      
      Logger.debug('TASKS', `Membresías encontradas (todas):`, allMemberData);
      
      // Como fallback temporal, devolver 'Empleado' para permitir funcionalidad básica
      Logger.warn('TASKS', 'Usuario no encontrado en organization_members, usando rol por defecto: Empleado');
      return 'Empleado';
    }
    
    // Tomar la primera membresía activa
    const member = memberData[0];
    Logger.debug('TASKS', `Miembro encontrado - Role ID: ${member.role_id}, Org ID: ${member.organization_id}`);
    
    // Paso 2: Obtener nombre del rol
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', member.role_id)
      .single();
    
    if (roleError || !roleData) {
      Logger.error('TASKS', 'Error al obtener nombre del rol:', roleError);
      return 'Empleado'; // Fallback
    }
    
    const roleName = roleData.name;
    Logger.info('TASKS', `Rol del usuario actual: ${roleName}`);
    return roleName;
  } catch (error) {
    Logger.error('TASKS', 'Error en getCurrentUserRole:', error);
    return 'Empleado'; // Fallback para permitir funcionalidad básica
  }
};

/**
 * Obtiene todas las tareas según los filtros especificados
 * @param filter Filtros para las tareas
 * @returns Lista de tareas
 */
export const getTasks = async (filter: TaskFilter = {}) => {
  try {
    const organizationId = getOrganizationId();
    // Usamos solo organizationId para evitar error
    let organizationName = 'Organización actual';
    
    // Verificar que organizationId sea válido
    if (!organizationId) {
      console.error('Error: organizationId no disponible');
      throw new Error('ID de organización no disponible');
    }
    
    // Verificar autenticación simple
    Logger.debug('TASKS', 'Verificando autenticación para obtener tareas');
    const { data: session } = await supabase.auth.getSession();
    
    if (!session?.session?.user) {
      Logger.warn('TASKS', 'Usuario no autenticado');
      // Continuar de todos modos para permitir acceso con políticas RLS
    } else {
      Logger.debug('TASKS', `Usuario autenticado: ${session.session.user.email}`);
    }

    Logger.debug('TASKS', `Filtros aplicados: ${JSON.stringify(filter)}`);
    Logger.info('TASKS', `Obteniendo tareas para organización: ${organizationId}`);
    
    // **FILTRADO AUTOMÁTICO POR ROL DE USUARIO**
    const userRole = await getCurrentUserRole();
    const currentUserId = await getCurrentUserId();
    
    if (userRole && currentUserId) {
      Logger.info('TASKS', `Aplicando filtros de rol: ${userRole} para usuario: ${currentUserId}`);
      
      // Aplicar filtrado automático según el rol
      switch (userRole) {
        case 'Empleado':
          // Empleados solo ven tareas asignadas a ellos
          Logger.info('TASKS', 'Rol Empleado: Filtrando solo tareas asignadas al usuario');
          filter.assigned_to = currentUserId;
          break;
          
        case 'Cliente':
          // Clientes solo ven tareas relacionadas con ellos
          Logger.info('TASKS', 'Rol Cliente: Filtrando solo tareas relacionadas al cliente');
          // Buscar el ID del cliente en la tabla customers
          const { data: customerData } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', currentUserId)
            .single();
          
          if (customerData) {
            filter.related_to_id = customerData.id;
            filter.related_to_type = 'customer';
          } else {
            // Si no se encuentra como cliente, no mostrar ninguna tarea
            Logger.warn('TASKS', 'Usuario con rol Cliente no encontrado en tabla customers');
            return [];
          }
          break;
          
        case 'Super Admin':
        case 'Admin de organización':
        case 'Manager':
        case 'Jefe de Finanzas':
          // Estos roles ven todas las tareas de su organización
          Logger.info('TASKS', `Rol ${userRole}: Acceso a todas las tareas de la organización`);
          // No se aplica filtrado adicional
          break;
          
        default:
          Logger.warn('TASKS', `Rol no reconocido: ${userRole}. Aplicando acceso limitado.`);
          // Por seguridad, usuarios con roles no reconocidos solo ven sus tareas asignadas
          filter.assigned_to = currentUserId;
          break;
      }
    } else {
      Logger.warn('TASKS', 'No se pudo obtener rol o ID de usuario. Aplicando filtrado restrictivo.');
      // Por seguridad, si no se puede determinar el rol, solo mostrar tareas asignadas
      if (currentUserId) {
        filter.assigned_to = currentUserId;
      }
    }
    
    // Construir la consulta básica con JOIN a customers
    let query = supabase
      .from('tasks')
      .select(`
        *,
        customer:customers(
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          identification_type,
          identification_number
        )
      `)
      .eq('organization_id', organizationId);
    
    // Aplicar filtros según los parámetros recibidos
    
    // 1. Filtro de estado
    if (filter.status && filter.status !== 'todas') {
      Logger.debug('TASKS', `Filtrando por estado: ${filter.status}`);
      query = query.eq('status', filter.status);
    }
    
    // 2. Filtro de tipo
    if (filter.type && filter.type !== 'todas') {
      Logger.debug('TASKS', `Filtrando por tipo: ${filter.type}`);
      query = query.eq('type', filter.type);
    }
    
    // 3. Filtro de prioridad
    if (filter.prioridad && filter.prioridad !== 'todas') {
      Logger.debug('TASKS', `Filtrando por prioridad: ${filter.prioridad}`);
      query = query.eq('prioridad', filter.prioridad);
    }
    
    // 4. Filtro de asignación
    if (filter.asignado || filter.assigned_to) {
      const valorAsignado = filter.asignado || filter.assigned_to;
      
      if (valorAsignado === 'si') {
        Logger.debug('TASKS', 'Filtrando tareas asignadas');
        query = query.not('assigned_to', 'is', null);
      } else if (valorAsignado === 'sin-asignar') {
        Logger.debug('TASKS', 'Filtrando tareas sin asignar');
        query = query.is('assigned_to', null);
      } else {
        Logger.debug('TASKS', `Filtrando por usuario: ${valorAsignado}`);
        query = query.eq('assigned_to', valorAsignado);
      }
    }
    
    // 5. Filtro por período de tiempo (hoy, semana, mes)
    if (filter.timeframe && filter.timeframe !== 'todos') {
      Logger.debug('TASKS', `Aplicando filtro temporal: ${filter.timeframe}`);
      
      let fechaInicio: string;
      let fechaFin: string;
      const hoy = new Date();
      
      switch (filter.timeframe) {
        case 'hoy':
          fechaInicio = hoy.toISOString().split('T')[0];
          fechaFin = fechaInicio;
          break;
        
        case 'esta-semana':
          const inicioSemana = new Date(hoy);
          inicioSemana.setDate(hoy.getDate() - hoy.getDay());
          fechaInicio = inicioSemana.toISOString().split('T')[0];
          
          const finSemana = new Date(inicioSemana);
          finSemana.setDate(inicioSemana.getDate() + 6);
          fechaFin = finSemana.toISOString().split('T')[0];
          break;
        
        case 'este-mes':
          fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
          fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];
          break;
        
        case 'proxima-semana':
          const proximaSemana = new Date(hoy);
          proximaSemana.setDate(hoy.getDate() + (7 - hoy.getDay()));
          fechaInicio = proximaSemana.toISOString().split('T')[0];
          
          const finProximaSemana = new Date(proximaSemana);
          finProximaSemana.setDate(proximaSemana.getDate() + 6);
          fechaFin = finProximaSemana.toISOString().split('T')[0];
          break;
        
        case 'proximo-mes':
          const proximoMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
          fechaInicio = proximoMes.toISOString().split('T')[0];
          fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0).toISOString().split('T')[0];
          break;
        
        default:
          Logger.warn('TASKS', `Timeframe no reconocido: ${filter.timeframe}`);
          return [];
      }
      
      Logger.debug('TASKS', `Rango de fechas: ${fechaInicio} - ${fechaFin}`);
      // Filtramos por el rango de fechas (inclusive)
      query = query.gte('due_date', fechaInicio).lte('due_date', fechaFin);
    }
    
    // 6. Filtro por fecha específica (prioridad sobre timeframe)
    if (filter.fecha && filter.fecha !== '') {
      console.log(`📆 Aplicando filtro por fecha específica: ${filter.fecha}`);
      
      // Normalizar la fecha para comparar solo YYYY-MM-DD
      const fechaFiltro = new Date(filter.fecha);
      const fechaFormateada = fechaFiltro.toISOString().split('T')[0];
      
      // Optimizamos el filtro para mejorar rendimiento
      // Usamos un enfoque más directo para filtrar por fecha completa
      const fechaInicio = `${fechaFormateada}T00:00:00Z`;
      const fechaFin = `${fechaFormateada}T23:59:59Z`;
      
      // Aplicamos ambos límites para asegurar que captamos todo el día en la zona horaria correcta
      query = query.gte('due_date', fechaInicio)
                   .lt('due_date', fechaFin);
      
      console.log(`🔍 Filtrando tareas entre ${fechaInicio} y ${fechaFin}`);
      console.log(`📅 Buscando tareas para la fecha: ${fechaFormateada}`);
    }
    
    // 7. Filtro por texto (búsqueda en título y descripción)
    if (filter.texto && filter.texto.trim() !== '') {
      const textoLimpio = filter.texto.trim();
      console.log(`🔍 Aplicando filtro por texto: "${textoLimpio}"`);
      
      // Crear consulta OR para buscar en título O descripción
      query = query.or(`title.ilike.%${textoLimpio}%,description.ilike.%${textoLimpio}%`);
    }
    
    // 8. Filtros por entidad relacionada (agregados para sistema de roles)
    if (filter.related_to_id) {
      Logger.debug('TASKS', `Filtrando por related_to_id: ${filter.related_to_id}`);
      query = query.eq('related_to_id', filter.related_to_id);
    }
    
    if (filter.related_to_type) {
      Logger.debug('TASKS', `Filtrando por related_to_type: ${filter.related_to_type}`);
      query = query.eq('related_to_type', filter.related_to_type);
    }
    
    // Ordenar por fecha de vencimiento (ascendente)
    query = query.order('due_date', { ascending: true });
    
    // Debug: Mostrar el total de tareas después de aplicar todos los filtros
    console.log('📊 Ejecutando consulta final con todos los filtros aplicados');
    try {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      
      console.log(`📊 Total de tareas para la organización ${organizationId} sin filtrar: ${count || 'desconocido'}`);
    } catch (countError) {
      console.error('❌ Error al contar tareas:', countError);
    }
    
    // Ejecutar la consulta con todos los filtros aplicados
    console.log('🔍 Ejecutando consulta a Supabase...');
    const { data, error } = await query;
    
    // Log adicional para debugging
    console.log('📊 Respuesta de Supabase:', {
      data: data ? `${data.length} tareas` : 'null',
      error: error ? error.message : 'sin error'
    });
    
    if (error) {
      console.error('❌ Error al obtener tareas:', error);
      throw new Error(`Error al consultar tareas: ${error.message}`);
    }
    
    // Verificación adicional antes de devolver los datos
    if (data && Array.isArray(data)) {
      console.log(`✅ Tareas filtradas obtenidas: ${data.length}`);
      
      // Obtener IDs únicos de usuarios asignados
      const usuariosAsignados = Array.from(new Set(
        data
          .map((tarea: any) => tarea.assigned_to)
          .filter((id: any) => id !== null)
      )) as string[];
      
      console.log(`👥 Usuarios asignados únicos encontrados: ${usuariosAsignados.length}`);
      
      // Obtener nombres de usuarios si hay usuarios asignados
      let usuariosMap = new Map<string, string>();
      
      if (usuariosAsignados.length > 0) {
        try {
          const { data: usuarios, error: errorUsuarios } = await supabase
            .from('user_profiles')
            .select('id, name')
            .in('id', usuariosAsignados);
          
          if (errorUsuarios) {
            console.warn('⚠️ Error al obtener nombres de usuarios:', errorUsuarios.message);
          } else if (usuarios) {
            // Crear mapa de ID -> nombre
            usuarios.forEach((usuario: any) => {
              usuariosMap.set(usuario.id, usuario.name);
            });
            console.log(`✅ Nombres de usuarios obtenidos: ${usuarios.length}`);
          }
        } catch (errorUsuarios) {
          console.warn('⚠️ Error al consultar usuarios:', errorUsuarios);
        }
      }
      
      // Obtener IDs únicos de clientes asignados
      const clientesAsignados = Array.from(new Set(
        data
          .map((tarea: any) => tarea.customer_id)
          .filter((id: any) => id !== null)
      )) as string[];
      
      console.log(`📁 Clientes asignados únicos encontrados: ${clientesAsignados.length}`);
      
      // Obtener información de clientes si hay clientes asignados
      let clientesMap = new Map<string, any>();
      
      if (clientesAsignados.length > 0) {
        try {
          const { data: clientes, error: errorClientes } = await supabase
            .from('customers')
            .select('id, full_name, first_name, last_name, email, phone')
            .in('id', clientesAsignados);
          
          if (errorClientes) {
            console.warn('⚠️ Error al obtener información de clientes:', errorClientes.message);
          } else if (clientes) {
            // Crear mapa de ID -> información del cliente
            clientes.forEach((cliente: any) => {
              clientesMap.set(cliente.id, cliente);
            });
            console.log(`✅ Información de clientes obtenida: ${clientes.length}`);
          }
        } catch (errorClientes) {
          console.warn('⚠️ Error al consultar clientes:', errorClientes);
        }
      }
      
      // Procesar los datos para agregar el nombre del usuario asignado y la información del cliente
      const tareasConNombres = data.map((tarea: any) => {
        const assigned_to_name = tarea.assigned_to ? usuariosMap.get(tarea.assigned_to) || null : null;
        const customer = tarea.customer_id ? clientesMap.get(tarea.customer_id) || null : null;
        
        return {
          ...tarea,
          assigned_to_name,
          customer
        };
      });
      
      // Mostrar muestra de datos para diagnóstico
      if (tareasConNombres.length > 0) {
        const muestra = tareasConNombres.slice(0, Math.min(3, tareasConNombres.length));
        console.log('📋 Muestra de tareas recuperadas:', 
          muestra.map(t => ({
            id: t.id,
            titulo: t.title,
            fecha: t.due_date,
            estado: t.status,
            asignado_a: t.assigned_to_name || 'No asignado'
          }))
        );
      }
      
      return tareasConNombres as Task[];
    } else {
      console.error('❌ No se recibieron datos en formato correcto:', data);
      return [];
    }
  } catch (error) {
    console.error('❌ Error al obtener tareas:', error);
    return [];
  }
};

/**
 * Crea una nueva tarea
 * @param task Nueva tarea para crear
 * @returns Tarea creada
 */
export const createTask = async (task: NewTask) => {
  try {
    // Verificamos que exista una sesión activa
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      console.error('Error de autenticación:', sessionError || 'No hay sesión activa');
      throw new Error('Debes iniciar sesión para crear una tarea');
    }
    
    const userId = sessionData.session.user.id;
    
    // Verificamos que el usuario pertenezca a la organización
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', task.organization_id)
      .maybeSingle();
    
    if (memberError) {
      console.error('Error al verificar membresía:', memberError);
    }
    
    // Si el usuario no pertenece a la organización, intentamos obtener su organización principal
    if (!memberData) {
      console.warn('Usuario no encontrado en la organización especificada, intentando con organización principal');
      
      // Obtenemos la primera organización del usuario
      const { data: firstOrgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (firstOrgMember) {
        task.organization_id = firstOrgMember.organization_id;
        console.log('Usando organización alternativa:', firstOrgMember.organization_id);
      } else {
        console.error('Usuario no pertenece a ninguna organización');
        throw new Error('No tienes permiso para crear tareas en esta organización');
      }
    }
    
    // Preparamos los datos con valores por defecto para campos obligatorios
    const taskData: any = {
      ...task,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId
    };
    
    // Asignamos customer_id si related_type es cliente
    if (task.related_type === 'cliente' || task.related_type === 'customer') {
      // Verificar si related_to_id es válido y no es un valor especial
      if (!task.related_to_id || task.related_to_id === 'no-client' || task.related_to_id === 'no-opportunity') {
        // Si no hay related_to_id o es un valor especial, no asignar customer_id
        taskData.customer_id = null;
        console.log('No se asignó cliente (valor especial o vacío)');
      } else {
        // Verificamos que el cliente realmente exista antes de asignar customer_id
        try {
          const { data: customerExists, error: customerError } = await supabase
            .from('customers')
            .select('id')
            .eq('id', task.related_to_id)
            .maybeSingle();
            
          if (customerError) {
            console.error('Error al verificar cliente:', customerError);
            // En caso de error, no asignar customer_id
            taskData.customer_id = null;
          } else if (customerExists) {
            // El cliente existe, podemos asignar customer_id
            taskData.customer_id = task.related_to_id;
            console.log(`Cliente verificado con ID: ${task.related_to_id}`);
          } else {
            // El cliente no existe, no asignar customer_id
            console.warn(`El cliente con ID ${task.related_to_id} no existe en la base de datos`);
            taskData.customer_id = null;
          }
        } catch (error) {
          console.error('Error al verificar cliente:', error);
          taskData.customer_id = null;
        }
      }
    }
    
    console.log('Datos a enviar a Supabase:', taskData);
    
    // Validación previa de campos críticos
    // Validamos UUIDs y otros campos antes de enviar
    if (taskData.related_to_id !== null && typeof taskData.related_to_id === 'string') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(taskData.related_to_id) || taskData.related_to_id.trim() === '') {
        console.error('related_to_id no es un UUID válido:', taskData.related_to_id);
        taskData.related_to_id = null; // Convertir a null si no es válido
        
        // Si estamos tratando con un cliente, también actualizamos customer_id
        if (taskData.related_type === 'cliente' || taskData.related_type === 'customer') {
          (taskData as any).customer_id = null;
        }
      } else if (taskData.related_type) {
        // Verificar si el elemento relacionado existe en la base de datos según su tipo
        try {
          let exists = false;
          
          // Determinar la tabla a consultar según el tipo de relación
          let tabla = '';
          let columnaId = 'id';
          
          switch(taskData.related_type) {
            case 'cliente':
            case 'customer': // También manejamos 'customer' para compatibilidad
              tabla = 'customers'; // Buscamos en la tabla customers que es donde carga los datos el formulario
              columnaId = 'id';    // En customers usamos 'id'
              // Actualizamos customer_id explícitamente para ser consistentes
              (taskData as any).customer_id = taskData.related_id;
              break;
            case 'oportunidad':
              tabla = 'opportunities';
              break;
            case 'proyecto':
              tabla = 'projects';
              break;
            // Añadir más casos según necesidad
          }
          
          if (tabla) {
            // Consultar usando la columna ID correcta según el tipo de entidad
            const { data, error } = await supabase
              .from(tabla)
              .select(columnaId)
              .eq(columnaId, taskData.related_id)
              .maybeSingle();
              
            exists = !error && !!data;
            
            if (error) {
              console.error(`Error al verificar ${taskData.related_type} relacionado:`, error);
            }
          }
          
          if (!exists) {
            console.error(`El ${taskData.related_type} relacionado no existe:`, taskData.related_id);
            taskData.related_id = null;
            // Si estamos tratando con un cliente, también actualizamos customer_id
            if (taskData.related_type === 'cliente' || taskData.related_type === 'customer') {
              (taskData as any).customer_id = null;
            }
            taskData.related_type = 'otro'; // Usamos 'otro' como valor predeterminado cuando la entidad no existe
          }
        } catch (error) {
          console.error('Error al verificar elemento relacionado:', error);
          taskData.related_id = null; // En caso de error, establecer a null para eviar violaciones
          // Si estamos tratando con un cliente, también actualizamos customer_id
          if (taskData.related_type === 'cliente' || taskData.related_type === 'customer') {
            (taskData as any).customer_id = null;
          }
        }
      }
    }

    // Validación más estricta para assigned_to
    if (taskData.assigned_to !== null && typeof taskData.assigned_to === 'string') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(taskData.assigned_to) || taskData.assigned_to.trim() === '') {
        console.error('assigned_to no es un UUID válido:', taskData.assigned_to);
        taskData.assigned_to = null; // Convertir a null si no es válido
      } else {
        // Verificar si el usuario existe en la tabla profiles
        try {
          const { data: userExists, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', taskData.assigned_to)
            .maybeSingle();
          
          if (userError || !userExists) {
            console.warn('Aviso: El usuario asignado no existe en la tabla profiles. Se establecerá como no asignado.');
            taskData.assigned_to = null; // Si no existe el usuario, establecer a null
          }
        } catch (error) {
          console.error('Error al verificar usuario asignado:', error);
          taskData.assigned_to = null; // En caso de error, establecer a null para evitar violaciones
        }
      }
    }
    
    // Validar el campo priority
    if (!['low', 'med', 'high'].includes(taskData.priority)) {
      console.error('Valor de prioridad no válido:', taskData.priority);
      // Asignar un valor predeterminado válido
      taskData.priority = 'med';
    }
    
    // Validar y mapear el campo status
    if (!['open', 'done', 'canceled'].includes(taskData.status)) {
      console.error('Valor de estado no válido:', taskData.status);
      // Mapear valores en español a valores aceptados por la BD
      const statusUI = taskData.status as unknown as TaskStatusUI;
      switch(statusUI) {
        case 'pendiente':
        case 'en_progreso':
          taskData.status = 'open';
          break;
        case 'completada':
          taskData.status = 'done';
          break;
        case 'cancelada':
          taskData.status = 'canceled';
          break;
        default:
          // Valor predeterminado
          taskData.status = 'open';
      }
    }

    console.log('Datos validados para enviar a Supabase:', JSON.stringify(taskData, null, 2));
    
    // Verificación adicional para organization_id (campo obligatorio)
    if (!taskData.organization_id || typeof taskData.organization_id !== 'number') {
      console.error('Error: organization_id inválido o no proporcionado:', taskData.organization_id);
      // Intentamos obtener el ID de organización
      try {
        const organizationId = await getOrganizationId();
        if (organizationId) {
          taskData.organization_id = organizationId;
          console.log('organization_id actualizado a:', organizationId);
        } else {
          throw new Error('No se pudo determinar el ID de organización');
        }
      } catch (orgError) {
        console.error('Error al obtener organization_id:', orgError);
        throw new Error('No se pudo determinar la organización para crear la tarea');
      }
    }
    
    // Verificar que la organización existe realmente en la base de datos
    try {
      const { data: orgExists, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', taskData.organization_id)
        .maybeSingle();
        
      if (orgError) {
        console.error('Error al verificar organización:', orgError);
      }
      
      if (!orgExists) {
        console.error(`La organización con ID ${taskData.organization_id} no existe en la base de datos`);
        // Intentar buscar una organización válida
        const { data: validOrg } = await supabase
          .from('organizations')
          .select('id')
          .limit(1)
          .maybeSingle();
          
        if (validOrg) {
          console.log(`Usando organización alternativa con ID: ${validOrg.id}`);
          taskData.organization_id = validOrg.id;
        } else {
          throw new Error('No se encontró ninguna organización válida');
        }
      }
    } catch (error) {
      console.error('Error al verificar la organización:', error);
    }

    // Intentamos crear la tarea
    try {
      // Verificar que todos los campos requeridos están presentes y tienen el formato correcto
      if (!taskData.organization_id) {
        throw new Error('El ID de organización es obligatorio');
      }
      
      if (!taskData.title || typeof taskData.title !== 'string' || taskData.title.trim() === '') {
        throw new Error('El título de la tarea es obligatorio y no puede estar vacío');
      }

      // Log detallado antes de enviar
      console.log('Datos finales a enviar a Supabase:', JSON.stringify(taskData, null, 2));
      
      // Crear un objeto limpio con solo los campos que pertenecen a la tabla tasks
      // Esto ayuda a evitar errores por campos adicionales que no existen en la tabla
      const cleanedTaskData = {
        organization_id: taskData.organization_id,
        title: taskData.title,
        description: taskData.description || '',
        type: taskData.type,
        priority: taskData.priority,
        status: taskData.status,
        due_date: taskData.due_date,
        assigned_to: taskData.assigned_to,
        // Usando los nombres correctos de columnas en la base de datos
        related_to_type: taskData.related_type,  // Mapear related_type a related_to_type
        related_to_id: taskData.related_id,      // Mapear related_id a related_to_id
        start_time: taskData.start_time,
        remind_before_minutes: taskData.remind_before_minutes,
        remind_email: taskData.remind_email,
        remind_push: taskData.remind_push,
        customer_id: taskData.customer_id,
        created_by: taskData.created_by,
        cancellation_reason: taskData.cancellation_reason,
        parent_task_id: taskData.parent_task_id  // ✅ AGREGADO: Campo para subtareas
      };
      
      console.log('Usando columnas correctas: related_to_id y related_to_type en lugar de related_id y related_type');
      
      console.log('Datos limpiados para insertar:', JSON.stringify(cleanedTaskData, null, 2));
      
      const { data, error } = await supabase
        .from('tasks')
        .insert(cleanedTaskData)
        .select('*')
        .single();
      
      if (error) {
        console.error('Error al crear tarea en Supabase:', error);
        console.error('Código:', error.code);
        console.error('Mensaje:', error.message);
        console.error('Detalles:', error.details);
        throw new Error(`Error de Supabase (${error.code}): ${error.message}. Detalles: ${error.details || 'No hay detalles adicionales'}`);
      }
      
      console.log('✅ Tarea creada exitosamente, generando notificaciones automáticas...');
      
      // Generar notificaciones automáticas para asignación y clientes
      try {
        const notificationResults = await generateTaskNotifications(data, true);
        const successfulNotifications = notificationResults.filter(r => r.success).length;
        const totalNotifications = notificationResults.length;
        
        console.log(`📧 Notificaciones procesadas: ${successfulNotifications}/${totalNotifications} exitosas`);
        
        // Generar delivery logs para las notificaciones exitosas
        if (successfulNotifications > 0) {
          console.log(`🔄 Generando delivery logs para ${successfulNotifications} notificaciones...`);
          
          // Obtener las últimas notificaciones creadas para esta organización
          try {
            const { data: recentNotifications, error: notifError } = await supabase
              .from('notifications')
              .select('id')
              .eq('organization_id', data.organization_id)
              .order('created_at', { ascending: false })
              .limit(successfulNotifications);
            
            if (!notifError && recentNotifications && recentNotifications.length > 0) {
              const notificationIds = recentNotifications.map(n => n.id);
              await createAutomaticDeliveryLogs(
                notificationIds, 
                data.organization_id, 
                data.type || 'general'
              );
            }
          } catch (deliveryLogError) {
            console.error('❌ Error al crear delivery logs (no crítico):', deliveryLogError);
          }
        }
        
        // Log de notificaciones fallidas para diagnóstico
        const failedNotifications = notificationResults.filter(r => !r.success);
        if (failedNotifications.length > 0) {
          console.warn('⚠️ Notificaciones fallidas:', failedNotifications.map(r => r.message));
        }
      } catch (notificationError: any) {
        // Las notificaciones no deben fallar la creación de la tarea
        console.error('❌ Error al generar notificaciones (no crítico):', notificationError);
      }
      
      return data as Task;
    } catch (insertError: any) { // Tipamos como any para acceder a propiedades
      console.error('Error capturado durante la inserción:', insertError);
      
      // Mejorar la serialización del error
      let errorMessage = 'Error al insertar tarea';
      
      if (typeof insertError === 'object' && insertError !== null) {
        // Intentar extraer propiedades específicas del error
        if (insertError.message) {
          errorMessage += `: ${insertError.message}`;
        }
        
        if (insertError.code) {
          errorMessage += ` (código: ${insertError.code})`;
        }
        
        if (insertError.details) {
          errorMessage += `. Detalles: ${insertError.details}`;
        }
        
        // Añadir propiedades adicionales que podrían ser útiles
        const errorProps = Object.keys(insertError)
          .filter(key => !['message', 'code', 'details'].includes(key))
          .map(key => `${key}: ${JSON.stringify(insertError[key])}`)
          .join(', ');
        
        if (errorProps) {
          errorMessage += `. Propiedades adicionales: ${errorProps}`;
        }
      } else {
        // Si no es un objeto, intentar convertirlo a string
        errorMessage += `: ${String(insertError)}`;
      }
      
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Error detallado en createTask:', error);
    
    // Mejorar el mensaje de error para depuración
    let mensajeError = 'Error al crear tarea';
    
    if (error.code) {
      console.error(`Código de error: ${error.code}`);
      mensajeError += ` (${error.code})`;
    }
    
    if (error.message) {
      console.error(`Mensaje de error: ${error.message}`);
      mensajeError += `: ${error.message}`;
    }
    
    if (error.details) {
      console.error(`Detalles de error: ${error.details}`);
      mensajeError += ` - ${error.details}`;
    }
    
    // Crear un nuevo error con mensaje mejorado
    const enhancedError = new Error(mensajeError);
    
    // Copiar propiedades del error original a un objeto personalizado
    const customError: any = enhancedError;
    if (error.code) customError.code = error.code;
    if (error.details) customError.details = error.details;
    
    throw enhancedError;
  }
};

/**
 * Actualiza una tarea existente
 * @param id ID de la tarea a actualizar
 * @param task Datos actualizados de la tarea
 * @returns Tarea actualizada
 */
export const updateTask = async (id: string, taskData: Partial<Task>) => {
  try {
    console.log('Actualizando tarea con ID:', id);
    console.log('Datos recibidos para actualización:', JSON.stringify(taskData, null, 2));
    
    // Obtener el estado anterior de la tarea para comparar cambios en asignación
    const { data: previousTask, error: fetchError } = await supabase
      .from('tasks')
      .select('assigned_to, related_to_type, related_to_id, organization_id')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      console.error('Error al obtener tarea anterior:', fetchError);
      throw new Error(`Error al obtener tarea: ${fetchError.message}`);
    }
    
    console.log('📋 Estado anterior de la tarea:', {
      previousAssignedTo: previousTask?.assigned_to,
      newAssignedTo: taskData.assigned_to
    });
    
    // Crear una copia de los datos para poder modificarlos
    const updatedTask = { ...taskData, updated_at: new Date().toISOString() };
    
    // Validación para assigned_to
    if (updatedTask.assigned_to !== undefined) {
      if (updatedTask.assigned_to !== null && typeof updatedTask.assigned_to === 'string') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(updatedTask.assigned_to) || updatedTask.assigned_to.trim() === '') {
          console.warn('assigned_to no es un UUID válido, se establecerá como null');
          updatedTask.assigned_to = null;
        } else {
          // Verificar si el usuario existe en la tabla profiles
          try {
            const { data: userExists, error: userError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', updatedTask.assigned_to)
              .maybeSingle();
            
            if (userError || !userExists) {
              console.warn('El usuario asignado no existe en la tabla users, se establecerá como null');
              updatedTask.assigned_to = null;
            }
          } catch (error) {
            console.error('Error al verificar usuario asignado:', error);
            updatedTask.assigned_to = null;
          }
        }
      }
    }
    
    // Validación para related_to_id
    if (updatedTask.related_to_id !== undefined) {
      if (updatedTask.related_to_id !== null && typeof updatedTask.related_to_id === 'string') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(updatedTask.related_to_id) || updatedTask.related_to_id.trim() === '') {
          console.warn('related_to_id no es un UUID válido, se establecerá como null');
          updatedTask.related_to_id = null;
        } else if (updatedTask.related_to_type) {
          // Verificar que el elemento relacionado existe según su tipo
          try {
            let tabla = '';
            switch(updatedTask.related_to_type) {
              case 'cliente': tabla = 'customers'; break;
              case 'oportunidad': tabla = 'opportunities'; break;
              case 'proyecto': tabla = 'projects'; break;
            }
            
            if (tabla) {
              const { data, error } = await supabase
                .from(tabla)
                .select('id')
                .eq('id', updatedTask.related_to_id)
                .maybeSingle();
              
              if (error || !data) {
                console.warn(`El ${updatedTask.related_to_type} relacionado no existe, se establecerá como null`);
                updatedTask.related_to_id = null;
              }
            }
          } catch (error) {
            console.error('Error al verificar elemento relacionado:', error);
            updatedTask.related_to_id = null;
          }
        }
      }
    }
    
    // Validar campos importantes si están presentes
    if (updatedTask.priority && !['low', 'med', 'high'].includes(updatedTask.priority)) {
      updatedTask.priority = 'med';
    }
    
    if (updatedTask.status && !['open', 'in_progress', 'done', 'canceled'].includes(updatedTask.status)) {
      updatedTask.status = 'open';
    }
    
    console.log('Datos validados para actualizar:', JSON.stringify(updatedTask, null, 2));
    
    // Limpiar datos antes de la actualización - solo campos válidos
    const cleanedUpdateData: any = {};
    const validFields = [
      'title', 'description', 'type', 'priority', 'status', 'due_date',
      'assigned_to', 'related_to_type', 'related_to_id', 'start_time',
      'remind_before_minutes', 'remind_email', 'remind_push', 'customer_id',
      'cancellation_reason', 'parent_task_id', 'updated_at'
    ];
    
    // Solo incluir campos que existen en la tabla y no son undefined
    for (const field of validFields) {
      if (updatedTask.hasOwnProperty(field) && (updatedTask as any)[field] !== undefined) {
        cleanedUpdateData[field] = (updatedTask as any)[field];
      }
    }
    
    console.log('Datos limpios para UPDATE:', JSON.stringify(cleanedUpdateData, null, 2));
    
    // Validación final antes de la actualización
    if (Object.keys(cleanedUpdateData).length === 0) {
      console.warn('⚠️ No hay datos para actualizar, solo updated_at');
      cleanedUpdateData.updated_at = new Date().toISOString();
    }
    
    console.log(`🔄 Ejecutando UPDATE en tasks con ID: ${id}`);
    console.log(`📋 Campos a actualizar: ${Object.keys(cleanedUpdateData).join(', ')}`);
    
    // Realizar la actualización
    const { data, error } = await supabase
      .from('tasks')
      .update(cleanedUpdateData)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) {
      console.error('❌ Error al actualizar tarea - Diagnóstico completo:', {
        error: error,
        errorType: typeof error,
        errorKeys: Object.keys(error || {}),
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        data: JSON.stringify(updatedTask, null, 2)
      });
      
      const errorMessage = error?.message || error?.details || 'Error desconocido al actualizar tarea';
      throw new Error(`Error de Supabase al actualizar tarea: ${errorMessage}`);
    }
    
    console.log('✅ Tarea actualizada exitosamente, verificando si generar notificaciones...');
    
    // Generar notificaciones automáticas solo si el usuario asignado cambió
    const assignmentChanged = previousTask && data.assigned_to !== previousTask.assigned_to;
    
    if (assignmentChanged) {
      console.log('🔄 Asignación cambió, generando notificaciones automáticas...');
      
      try {
        const notificationResults = await generateTaskNotifications(
          data, 
          false, // No es tarea nueva
          previousTask.assigned_to // Usuario anteriormente asignado
        );
        const successfulNotifications = notificationResults.filter(r => r.success).length;
        const totalNotifications = notificationResults.length;
        
        console.log(`📧 Notificaciones procesadas: ${successfulNotifications}/${totalNotifications} exitosas`);
        
        // Log de notificaciones fallidas para diagnóstico
        const failedNotifications = notificationResults.filter(r => !r.success);
        if (failedNotifications.length > 0) {
          console.warn('⚠️ Notificaciones fallidas:', failedNotifications.map(r => r.message));
        }
      } catch (notificationError: any) {
        // Las notificaciones no deben fallar la actualización de la tarea
        console.error('❌ Error al generar notificaciones (no crítico):', notificationError);
      }
    } else {
      console.log('📝 No se requieren notificaciones - la asignación no cambió');
    }
    
    return data as Task;
  } catch (error: any) {
    console.error('Error en updateTask:', error);
    
    // Imprimir detalles del error para mejor diagnóstico
    console.error('Tipo de error:', typeof error);
    console.error('Propiedades del error:', Object.keys(error || {}));
    console.error('Error stringificado:', JSON.stringify(error, null, 2));
    
    // Crear un mensaje de error más detallado
    let errorMessage = 'Error en actualización de tarea';
    
    if (error && error.message) {
      errorMessage += `: ${error.message}`;
    }
    
    if (error && error.code) {
      errorMessage += ` (código: ${error.code})`;
    }
    
    if (error && error.details) {
      errorMessage += ` - ${error.details}`;
    }
    
    // Crear un error con información más completa
    const enhancedError = new Error(errorMessage);
    throw enhancedError;
  }
};

/**
 * Cambia el estado de una tarea
 * @param id ID de la tarea
 * @param status Nuevo estado
 * @param cancellationReason Motivo de cancelación (opcional, solo para estado 'canceled')
 * @returns Tarea actualizada
 */
export const changeTaskStatus = async (id: string, status: TaskStatus, cancellationReason?: string) => {
  try {
    const updateData: Partial<Task> = {
      status,
      updated_at: new Date().toISOString()
    };
    
    // Manejo específico según el estado
    if (status === 'done' || status === 'canceled') {
      // Para tareas completadas o canceladas
      const { data: sessionData } = await supabase.auth.getSession();
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = sessionData.session?.user.id;
      
      // Si es cancelación y hay motivo, guardarlo
      if (status === 'canceled' && cancellationReason) {
        updateData.cancellation_reason = cancellationReason;
      }
    } else if (status === 'in_progress') {
      // Para tareas en progreso, limpiamos campos de completitud/cancelación
      updateData.completed_at = null;
      updateData.completed_by = null;
      updateData.cancellation_reason = null;
    } else if (status === 'open') {
      // Para tareas pendientes, también limpiamos campos de completitud/cancelación
      updateData.completed_at = null;
      updateData.completed_by = null;
      updateData.cancellation_reason = null;
    }
    
    return await updateTask(id, updateData);
  } catch (error) {
    console.error('Error en changeTaskStatus:', error);
    throw error;
  }
};

/**
 * Elimina una tarea
 * @param id ID de la tarea a eliminar
 * @returns Confirmación de eliminación
 */
export const deleteTask = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error al eliminar tarea:', error);
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error en deleteTask:', error);
    throw error;
  }
};

/**
 * Obtiene una tarea por su ID
 * @param id ID de la tarea
 * @returns Tarea
 */
export const getTaskById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        customer:customers(
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          identification_type,
          identification_number
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error al obtener tarea:', error);
      throw error;
    }
    
    return data as Task;
  } catch (error) {
    console.error('Error en getTaskById:', error);
    throw error;
  }
};

/**
 * Mapea un estado de TaskStatus (BD) a TaskStatusUI (Interfaz)
 */
const mapDbValueToUIStatus = (status: TaskStatus): TaskStatusUI => {
  switch(status) {
    case 'open': return 'pendiente'; // Por defecto usamos 'pendiente' para 'open'
    case 'done': return 'completada'; // Por defecto usamos 'completada' para 'done'
    case 'canceled': return 'cancelada'; // Nuevo estado para tareas canceladas
    default: return 'pendiente';
  }
};

/**
 * Obtiene tareas agrupadas por estado para el tablero Kanban
 * @returns Objeto con tareas agrupadas por estado UI (pendiente, en_progreso, etc)
 */
export const getTasksByStatus = async (filter: TaskFilter = {}) => {
  try {
    const tasks = await getTasks(filter);
    
    // Verificar que tasks es un array
    if (!Array.isArray(tasks)) {
      console.error('Error: getTasks no devolvió un array:', tasks);
      return {
        pendiente: [],
        en_progreso: [],
        completada: [],
        cancelada: []
      };
    }
    
    // Agrupar por estado mapeando los valores de BD a UI
    const tasksByStatus = {
      pendiente: tasks.filter((task: Task) => mapDbValueToUIStatus(task.status) === 'pendiente'),
      en_progreso: tasks.filter((task: Task) => mapDbValueToUIStatus(task.status) === 'en_progreso'),
      completada: tasks.filter((task: Task) => mapDbValueToUIStatus(task.status) === 'completada'),
      cancelada: tasks.filter((task: Task) => mapDbValueToUIStatus(task.status) === 'cancelada')
    };
    
    return tasksByStatus;
  } catch (error) {
    console.error('Error en getTasksByStatus:', error);
    throw error;
  }
};

// ==========================================
// FUNCIONES PARA SUBTAREAS
// ==========================================

/**
 * Obtiene tareas con sus subtareas incluidas
 * @param filter Filtros para las tareas
 * @returns Lista de tareas con subtareas
 */
export const getTasksWithSubtasks = async (filter: TaskFilter = {}) => {
  try {
    const organizationId = getOrganizationId();
    
    if (!organizationId) {
      throw new Error('Organization ID no disponible');
    }

    let query = supabase
      .from('tasks')
      .select(`
        *,
        user_profiles!assigned_to(first_name, last_name),
        customers!customer_id(first_name, last_name, email, phone),
        subtasks:tasks!parent_task_id(
          *,
          user_profiles!assigned_to(first_name, last_name)
        )
      `)
      .eq('organization_id', organizationId);

    // Aplicar filtros
    if (filter.only_parent_tasks) {
      query = query.is('parent_task_id', null);
    }
    
    if (filter.only_subtasks) {
      query = query.not('parent_task_id', 'is', null);
    }
    
    if (filter.parent_task_id !== undefined) {
      if (filter.parent_task_id === null) {
        query = query.is('parent_task_id', null);
      } else {
        query = query.eq('parent_task_id', filter.parent_task_id);
      }
    }
    
    // Aplicar otros filtros existentes
    if (filter.status && filter.status !== 'todas') {
      query = query.eq('status', filter.status);
    }
    
    if (filter.assigned_to && filter.assigned_to !== 'todos') {
      query = query.eq('assigned_to', filter.assigned_to);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error en consulta de subtareas:', error);
      throw error;
    }
    
    // Procesar datos para agregar campos calculados
    const processedTasks = data?.map(task => {
      const subtasks = task.subtasks || [];
      const completedSubtasks = subtasks.filter((sub: any) => sub.status === 'done').length;
      const totalSubtasks = subtasks.length;
      
      return {
        ...task,
        assigned_to_name: task.user_profiles ? 
          `${task.user_profiles.first_name || ''} ${task.user_profiles.last_name || ''}`.trim() : null,
        customer: task.customers ? {
          id: task.customers.id,
          first_name: task.customers.first_name,
          last_name: task.customers.last_name,
          full_name: `${task.customers.first_name || ''} ${task.customers.last_name || ''}`.trim(),
          email: task.customers.email,
          phone: task.customers.phone,
          identification_type: null,
          identification_number: null
        } : null,
        subtasks: subtasks.map((subtask: any) => ({
          ...subtask,
          assigned_to_name: subtask.user_profiles ? 
            `${subtask.user_profiles.first_name || ''} ${subtask.user_profiles.last_name || ''}`.trim() : null,
          depth: 1
        })),
        subtask_count: totalSubtasks,
        completed_subtasks: completedSubtasks,
        is_parent: totalSubtasks > 0,
        depth: task.parent_task_id ? 1 : 0,
        progress: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0
      };
    }) || [];
    
    console.log(`✅ Obtenidas ${processedTasks.length} tareas con subtareas`);
    return processedTasks;
    
  } catch (error) {
    console.error('Error al obtener tareas con subtareas:', error);
    throw error;
  }
};

/**
 * Crea una nueva subtarea
 * @param parentId ID de la tarea padre
 * @param subtaskData Datos de la subtarea
 * @returns Subtarea creada
 */
export const createSubtask = async (parentId: string, subtaskData: Omit<NewTask, 'parent_task_id'>) => {
  try {
    // Obtener datos de la tarea padre
    const { data: parentTask, error: parentError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', parentId)
      .single();
      
    if (parentError || !parentTask) {
      throw new Error('Tarea padre no encontrada');
    }
    
    // Crear subtarea heredando contexto del padre
    const taskData: NewTask = {
      ...subtaskData,
      parent_task_id: parentId,
      organization_id: parentTask.organization_id,
      related_to_id: parentTask.related_to_id,
      related_type: parentTask.related_to_type as any,
      customer_id: parentTask.customer_id,
      // Prioridad por defecto igual al padre si no se especifica
      priority: subtaskData.priority || parentTask.priority
    };
    
    console.log('📝 Creando subtarea:', {
      parentId,
      title: taskData.title,
      inherited: {
        organization_id: taskData.organization_id,
        related_to_id: taskData.related_to_id,
        related_to_type: (taskData as any).related_type,
        customer_id: taskData.customer_id
      }
    });
    
    const newSubtask = await createTask(taskData);
    
    console.log('✅ Subtarea creada exitosamente:', newSubtask.id);
    return newSubtask;
    
  } catch (error) {
    console.error('Error al crear subtarea:', error);
    throw error;
  }
};

/**
 * Obtiene la jerarquía completa de una tarea
 * @param taskId ID de la tarea
 * @returns Jerarquía de la tarea
 */
export const getTaskHierarchy = async (taskId: string): Promise<TaskHierarchy | null> => {
  try {
    const { data: task, error } = await supabase
      .from('tasks')
      .select(`
        *,
        user_profiles!assigned_to(first_name, last_name),
        customers!customer_id(first_name, last_name, email, phone),
        subtasks:tasks!parent_task_id(
          *,
          user_profiles!assigned_to(first_name, last_name)
        )
      `)
      .eq('id', taskId)
      .single();
      
    if (error || !task) {
      console.error('Tarea no encontrada:', error);
      return null;
    }
    
    const subtasks = task.subtasks || [];
    const completedSubtasks = subtasks.filter((sub: any) => sub.status === 'done').length;
    const totalSubtasks = subtasks.length;
    
    const hierarchy: TaskHierarchy = {
      parent: {
        ...task,
        assigned_to_name: task.user_profiles ? 
          `${task.user_profiles.first_name || ''} ${task.user_profiles.last_name || ''}`.trim() : null,
        customer: task.customers ? {
          id: task.customers.id,
          first_name: task.customers.first_name,
          last_name: task.customers.last_name,
          full_name: `${task.customers.first_name || ''} ${task.customers.last_name || ''}`.trim(),
          email: task.customers.email,
          phone: task.customers.phone,
          identification_type: null,
          identification_number: null
        } : null,
        subtasks: subtasks.map((subtask: any) => ({
          ...subtask,
          assigned_to_name: subtask.user_profiles ? 
            `${subtask.user_profiles.first_name || ''} ${subtask.user_profiles.last_name || ''}`.trim() : null,
          depth: 1
        })),
        subtask_count: totalSubtasks,
        completed_subtasks: completedSubtasks,
        is_parent: totalSubtasks > 0,
        depth: 0,
        progress: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0
      },
      children: subtasks.map((subtask: any) => ({
        ...subtask,
        assigned_to_name: subtask.user_profiles ? 
          `${subtask.user_profiles.first_name || ''} ${subtask.user_profiles.last_name || ''}`.trim() : null,
        depth: 1
      })),
      totalSubtasks,
      completedSubtasks,
      progress: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0,
      depth: 1
    };
    
    return hierarchy;
    
  } catch (error) {
    console.error('Error al obtener jerarquía:', error);
    return null;
  }
};

/**
 * Obtiene estadísticas de subtareas para una tarea padre
 * @param parentId ID de la tarea padre
 * @returns Estadísticas de subtareas
 */
export const getSubtaskStats = async (parentId: string): Promise<SubtaskStats | null> => {
  try {
    const { data: subtasks, error } = await supabase
      .from('tasks')
      .select('status')
      .eq('parent_task_id', parentId);
      
    if (error) {
      console.error('Error al obtener estadísticas de subtareas:', error);
      return null;
    }
    
    if (!subtasks || subtasks.length === 0) {
      return {
        total: 0,
        completed: 0,
        pending: 0,
        in_progress: 0,
        canceled: 0,
        progress_percentage: 0
      };
    }
    
    const stats = subtasks.reduce((acc, subtask) => {
      acc.total++;
      switch (subtask.status) {
        case 'done':
          acc.completed++;
          break;
        case 'open':
          acc.pending++;
          break;
        case 'in_progress':
          acc.in_progress++;
          break;
        case 'canceled':
          acc.canceled++;
          break;
      }
      return acc;
    }, {
      total: 0,
      completed: 0,
      pending: 0,
      in_progress: 0,
      canceled: 0,
      progress_percentage: 0
    });
    
    stats.progress_percentage = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
    
    return stats;
    
  } catch (error) {
    console.error('Error al calcular estadísticas de subtareas:', error);
    return null;
  }
};

/**
 * Valida si una tarea puede ser eliminada (no debe tener subtareas activas)
 * @param taskId ID de la tarea
 * @returns Resultado de validación
 */
export const validateTaskDeletion = async (taskId: string): Promise<{ canDelete: boolean; message?: string }> => {
  try {
    const { data: subtasks, error } = await supabase
      .from('tasks')
      .select('id, status, title')
      .eq('parent_task_id', taskId)
      .not('status', 'in', '(done,canceled)');
      
    if (error) {
      console.error('Error al validar eliminación:', error);
      return { canDelete: false, message: 'Error al validar la tarea' };
    }
    
    if (subtasks && subtasks.length > 0) {
      return {
        canDelete: false,
        message: `No puedes eliminar esta tarea porque tiene ${subtasks.length} subtarea(s) pendiente(s). Completa o cancela todas las subtareas primero.`
      };
    }
    
    return { canDelete: true };
    
  } catch (error) {
    console.error('Error en validación de eliminación:', error);
    return { canDelete: false, message: 'Error al validar la tarea' };
  }
};

/**
 * Verifica si una tarea padre debería completarse automáticamente
 * @param parentId ID de la tarea padre
 * @returns Sugerencia de completado
 */
export const checkParentCompletion = async (parentId: string): Promise<{ shouldComplete: boolean; message?: string }> => {
  try {
    const { data: parentTask, error: parentError } = await supabase
      .from('tasks')
      .select('id, title, status')
      .eq('id', parentId)
      .single();
      
    if (parentError || !parentTask) {
      return { shouldComplete: false };
    }
    
    if (parentTask.status === 'done') {
      return { shouldComplete: false }; // Ya está completada
    }
    
    const { data: subtasks, error: subtasksError } = await supabase
      .from('tasks')
      .select('status')
      .eq('parent_task_id', parentId);
      
    if (subtasksError || !subtasks || subtasks.length === 0) {
      return { shouldComplete: false };
    }
    
    const allCompleted = subtasks.every(subtask => subtask.status === 'done');
    
    if (allCompleted) {
      return {
        shouldComplete: true,
        message: `Todas las subtareas de "${parentTask.title}" están completadas. ¿Deseas marcar la tarea padre como completada también?`
      };
    }
    
    return { shouldComplete: false };
    
  } catch (error) {
    console.error('Error al verificar completado de padre:', error);
    return { shouldComplete: false };
  }
};

// ====================================
// FUNCIÓN PARA DELIVERY LOGS AUTOMÁTICOS
// ====================================

/**
 * Crea delivery_logs automáticamente para notificaciones de tareas
 * Simula el envío real a diferentes proveedores (email, SMS, push)
 * @param notificationIds IDs de las notificaciones creadas
 * @param organizationId ID de la organización
 * @param taskType Tipo de tarea para determinar canales
 */
const createAutomaticDeliveryLogs = async (
  notificationIds: string[],
  organizationId: number,
  taskType: string = 'general'
): Promise<void> => {
  try {
    console.log(`🚀 Creando delivery logs automáticos para ${notificationIds.length} notificaciones`);
    
    for (const notificationId of notificationIds) {
      // Configuración de canales según el tipo de tarea
      const channelConfig = {
        email: { enabled: true, priority: 1 },
        push: { enabled: true, priority: 2 },
        sms: { enabled: taskType === 'urgent' || taskType === 'high_priority', priority: 3 }
      };
      
      // Lista de proveedores simulados
      const providers = {
        email: ['sendgrid', 'mailgun', 'postmark'],
        push: ['firebase', 'pusher', 'onesignal'],
        sms: ['twilio', 'nexmo', 'messagebird']
      };
      
      // Generar logs para cada canal habilitado
      for (const [channel, config] of Object.entries(channelConfig)) {
        if (!config.enabled) continue;
        
        const channelProviders = providers[channel as keyof typeof providers];
        const selectedProvider = channelProviders[Math.floor(Math.random() * channelProviders.length)];
        
        // Simular resultado del envío (90% éxito, 10% fallo)
        const isSuccess = Math.random() > 0.1;
        const deliveryStatus = isSuccess ? 'success' : 'fail';
        
        // Simular respuesta del proveedor
        const providerResponse = isSuccess 
          ? {
              status: 'delivered',
              message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              delivery_time: new Date().toISOString(),
              cost: (Math.random() * 0.02 + 0.001).toFixed(4),
              recipient_confirmed: true
            }
          : {
              status: 'failed',
              error_code: ['INVALID_RECIPIENT', 'RATE_LIMIT_EXCEEDED', 'PROVIDER_ERROR'][Math.floor(Math.random() * 3)],
              error_message: 'Simulated delivery failure for testing',
              retry_count: Math.floor(Math.random() * 3),
              next_retry: new Date(Date.now() + 300000).toISOString()
            };
        
        // Crear el delivery log con la estructura correcta de la tabla
        const deliveryLogData = {
          notification_id: notificationId,
          attempt_no: isSuccess ? 1 : Math.floor(Math.random() * 3) + 1,
          status: deliveryStatus,
          delivered_at: isSuccess ? new Date().toISOString() : new Date().toISOString(), // Siempre requerido
          provider_response: {
            channel: channel,
            provider: selectedProvider,
            ...providerResponse,
            // Información adicional en el JSON
            organization_id: organizationId,
            task_type: taskType,
            simulated: true
          }
        };
        
        // Insertar en la base de datos
        const { data: insertedLog, error: deliveryError } = await supabase
          .from('delivery_logs')
          .insert(deliveryLogData)
          .select('id')
          .single();
        
        if (deliveryError) {
          console.error(`❌ Error creando delivery log para ${channel}:`, {
            error: deliveryError,
            message: deliveryError.message,
            details: deliveryError.details,
            code: deliveryError.code,
            data: deliveryLogData
          });
        } else {
          console.log(`✅ Delivery log creado para ${channel} via ${selectedProvider}: ${deliveryStatus} (ID: ${insertedLog?.id})`);
        }
        
        // Simular delay entre envíos
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      }
    }
    
    console.log(`📊 Proceso de delivery logs completado para ${notificationIds.length} notificaciones`);
    
  } catch (error: any) {
    console.error('❌ Error general creando delivery logs:', error);
  }
};

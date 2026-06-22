'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Task, TaskFilter, TaskStatus } from '@/types/task';
import { getTasks } from '@/lib/services/taskService';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase/config';

/**
 * Hook personalizado para cargar datos de tareas y relacionados
 * Centraliza toda la lógica de carga y filtrado de tareas
 * @returns Funciones y estados para gestionar tareas
 */
export function useTareasDataLoader() {
  const { toast } = useToast();
  
  // Estados centralizados para tareas - Simplificación
  // Mantenemos un único estado principal para las tareas
  const [tareas, setTareas] = useState<Task[]>([]);
  // Estado para tareas procesadas (filtradas y enriquecidas)
  const [tareasProcesadas, setTareasProcesadas] = useState<Task[]>([]);
  // Estado para controlar la carga
  const [cargando, setCargando] = useState(false);
  // Estado para el último filtro aplicado
  const [filtroActual, setFiltroActual] = useState<TaskFilter>({});

  /**
   * Carga todas las tareas sin filtro (base para otras operaciones)
   * @returns Array de tareas cargadas o arreglo vacío si hay error
   */
  const cargarTodasLasTareas = useCallback(async () => {
    try {
      setCargando(true);
      
      // Intentar hasta 2 veces si falla la carga para evitar bucles largos
      let intentos = 0;
      const maxIntentos = 2;
      
      while (intentos < maxIntentos) {
        try {
          intentos++;

          
          // Llamar directamente a la función getTasks con un timeout
          const tareasPromise = getTasks();
          
          // Añadir un timeout para evitar bloqueos indefinidos (reducido a 10 segundos)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Tiempo de espera agotado al cargar tareas')), 10000);
          });
          
          // Usar Promise.race para manejar timeout
          const tareas = await Promise.race([tareasPromise, timeoutPromise]);
          

          
          // Verificar que las tareas se recibieron correctamente
          if (Array.isArray(tareas)) {

            
            // ACTUALIZAR ESTADOS
            setTareas(tareas);
            setTareasProcesadas(tareas);
            setCargando(false);
            
            if (tareas.length > 0) {

            } else {

            }
            return tareas;
          } else {
            console.error('getTasks no devolvió un array:', typeof tareas);
            if (intentos === maxIntentos) {
              // No mostramos toast, solo log para evitar problemas de UI
              console.error("Los datos recibidos no tienen el formato esperado");
              setCargando(false);
              return [];
            }
            // Esperar un segundo antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        } catch (innerError) {
          console.error(`Error en intento ${intentos}/${maxIntentos}:`, innerError);
          if (intentos === maxIntentos) {
            // No mostramos toast, solo log para evitar problemas de UI
            console.error("No se pudieron recuperar las tareas después de varios intentos");
            setCargando(false);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Si llegamos aquí después de todos los intentos, devolver array vacío

      setCargando(false);
      return [];
    } catch (error) {
      console.error('Error inesperado al cargar todas las tareas:', error);
      setCargando(false);
      // Devolver array vacío en lugar de null para evitar spinner infinito
      return [];
    }
  }, []);

  /**
   * Aplica los filtros especificados a un array de tareas
   * @param tareas Array de tareas a filtrar
   * @param filtroActual Objeto con los filtros a aplicar
   * @returns Array filtrado de tareas
   */
  const aplicarFiltrosTareas = useCallback((tareas: Task[], filtroActual: TaskFilter): Task[] => {

    
    if (!tareas || !Array.isArray(tareas)) {
      console.warn('aplicarFiltrosTareas: Parámetro tareas no válido', tareas);
      return [];
    }
    
    // Crear una copia de las tareas para filtrar
    let tareasFiltradas = [...tareas];
    
    // Verificar si el filtro tiene solo el timeframe 'todos' (caso especial)
    const soloFiltroTodos = Object.keys(filtroActual).length === 1 && 
      filtroActual.timeframe === 'todos';
                            
    if (Object.keys(filtroActual).length === 0 || soloFiltroTodos) {

      return tareasFiltradas;
    }
    
    // Verificar conflictos de filtros temporales
    let filtrosFinales = { ...filtroActual };
    if (filtrosFinales.timeframe && filtrosFinales.fecha) {
      console.warn('CONFLICTO: Se detectaron dos filtros temporales diferentes (timeframe y fecha)');
      console.warn('Priorizando timeframe y eliminando filtro por fecha específica');
      delete filtrosFinales.fecha;
    }
    

    
    // Verificar si hay filtros reales que aplicar
    const hayFiltros = Object.keys(filtrosFinales).some(key => {
      const valor = filtrosFinales[key as keyof TaskFilter];
      const esValido = valor !== undefined && valor !== null && valor !== 'todas' && valor !== '';

      return esValido;
    });
    
    // Si no hay filtros activos, devolver todas las tareas
    if (!hayFiltros) {

      return tareasFiltradas;
    }
    

    
    // Filtro por estado - VERSIÓN MEJORADA
    if (filtrosFinales.status && filtrosFinales.status !== 'todas') {

      
      // Usamos directamente el valor del filtro tal como viene
      // Ya que ahora en el selector ya usamos los valores reales de la BD
      const valorFiltro = filtrosFinales.status;
      

      
      // Análisis detallado de los estados presentes en las tareas
      const estadosPresentes = tareasFiltradas
        .map(t => t.status)
        .reduce((acc: Record<string, number>, estado) => {
          if (!estado) return acc;
          acc[estado] = (acc[estado] || 0) + 1;
          return acc;
        }, {});
      

      
      // Diagnóstico detallado: mostrar todas las tareas
      if (tareasFiltradas.length < 20) {

      }
      
      // Filtrar tareas que coincidan exactamente con el valor de filtro
      const tareasAntes = tareasFiltradas.length;
      
      tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
        // Si la tarea no tiene estado definido, la excluimos
        if (tarea.status === undefined || tarea.status === null) return false;
        
        // Comparación estricta con el valor del filtro
        const coincide = tarea.status === valorFiltro;
        
        // Si no coincide, mostramos un log de por qué se está excluyendo
        if (!coincide && tareasFiltradas.length < 20) {

        }
        
        return coincide;
      });
      
      const tareasDespues = tareasFiltradas.length;

      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {
        console.warn('⚠️ NO HAY TAREAS QUE COINCIDAN CON EL ESTADO SELECCIONADO');
      }
    }
    
    // Filtro por tipo de tarea
    if (filtrosFinales.type && filtrosFinales.type !== 'todas') {

      
      const tareasAntes = tareasFiltradas.length;
      
      // Verificar que el campo tipo esté presente en las tareas
      const tiposPresentes = new Set<string>();
      tareasFiltradas.forEach(tarea => {
        if (tarea.type) {
          tiposPresentes.add(tarea.type);
        }
      });

      
      // Mostrar valor del filtro para diagnóstico

      
      // Si el filtro es tipo UI (en español) o tipo BD
      const valoresTipoValidos = ['llamada', 'reunion', 'email', 'visita', 'tarea', 'seguimiento', 'revision', 'entrega', 'investigacion', 'documento', 'bug', 'feature'];
      const tipoValido = valoresTipoValidos.includes(filtrosFinales.type);
      
      if (tipoValido) {

        
        const antesDelFiltro = [...tareasFiltradas]; // Copia para diagnóstico
        
        tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
          // Si la tarea no tiene tipo definido, la excluimos del filtro
          if (tarea.type === undefined || tarea.type === null) {

            return false;
          }
          
          // Verificar coincidencia exacta (case sensitive)
          const coincide = tarea.type === filtrosFinales.type;
          
          // Diagnóstico de coincidencia

          
          // Siempre mostrar detalles para diagnóstico
          if (!coincide && antesDelFiltro.length < 20) {

          }
          
          if (coincide && antesDelFiltro.length < 20) {

          }
          
          return coincide;
        });
      } else {

      }
      
      const tareasDespues = tareasFiltradas.length;

      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {
        console.warn('⚠️ NO HAY TAREAS QUE COINCIDAN CON EL TIPO SELECCIONADO');
      }
    }
    
    // Filtro por prioridad
    if (filtrosFinales.prioridad && filtrosFinales.prioridad !== 'todas') {

      
      const tareasAntes = tareasFiltradas.length;
      
      // Verificar que el campo priority esté presente en las tareas
      const prioridadesPresentes = new Set<string>();
      tareasFiltradas.forEach(tarea => {
        if (tarea.priority) {
          prioridadesPresentes.add(tarea.priority);
        }
      });

      
      // Mostrar valor del filtro para diagnóstico

      
      // Los valores ya vienen como 'low', 'med', 'high' directamente desde el UI
      // Valores válidos de prioridad
      const valoresPrioridadValidos = ['low', 'med', 'high'];
      const prioridadValida = valoresPrioridadValidos.includes(filtrosFinales.prioridad);
      
      if (prioridadValida) {


        
        const antesDelFiltro = [...tareasFiltradas]; // Copia para diagnóstico
        
        tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
          // Si la tarea no tiene prioridad definida, la excluimos del filtro
          if (tarea.priority === undefined || tarea.priority === null) {
            console.log(`⚠️ Tarea ${tarea.id} sin prioridad definida - EXCLUIDA`);
            return false;
          }
          
          // Verificar coincidencia exacta
          const coincide = tarea.priority === filtrosFinales.prioridad;
          
          // Diagnóstico de coincidencia
          if (antesDelFiltro.length < 20) {
            console.log(`🔎 Comparando prioridad: '${tarea.priority}' vs '${filtrosFinales.prioridad}' = ${coincide ? 'COINCIDE' : 'NO COINCIDE'}`);
          }
          
          // Mostrar detalles para diagnóstico
          if (!coincide && antesDelFiltro.length < 20) {
            console.log(`❌ Excluyendo tarea ${tarea.id} - Prioridad actual: '${tarea.priority}' ≠ '${filtrosFinales.prioridad}'`);
          }
          
          if (coincide && antesDelFiltro.length < 20) {
            console.log(`✅ Incluyendo tarea ${tarea.id} - Prioridad: '${tarea.priority}'`);
          }
          
          return coincide;
        });
      } else {
        console.log(`⚠️ Prioridad no reconocida en filtro: ${filtrosFinales.prioridad}`);
        console.log(`⚠️ DIAGNÓSTICO: Valor '${filtrosFinales.prioridad}' no está en los valores válidos: ${JSON.stringify(valoresPrioridadValidos)}`);
      }
      
      const tareasDespues = tareasFiltradas.length;

      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {
        console.warn('⚠️ NO HAY TAREAS QUE COINCIDAN CON LA PRIORIDAD SELECCIONADA');
      }
    }
    
    // SOLUCIÓN DEFINITIVA - Filtro por fecha límite con alta prioridad
    if (filtrosFinales.fecha && filtrosFinales.fecha !== '') {

      
      // Contenedor para tareas que coincidan con la fecha del filtro
      let tareasConFechaCoincidente: Task[] = [];
      
      try {
        // 1. Procesar la fecha del filtro de forma robusta
        const fechaFiltroObj = new Date(filtrosFinales.fecha);
        if (isNaN(fechaFiltroObj.getTime())) {
          throw new Error(`Fecha de filtro inválida: ${filtrosFinales.fecha}`);
        }
        
        // 2. Normalizar la fecha del filtro para obtener sólo la parte de fecha (sin hora)
        const añoFiltro = fechaFiltroObj.getFullYear();
        const mesFiltro = fechaFiltroObj.getMonth(); // 0-11
        const diaFiltro = fechaFiltroObj.getDate(); // 1-31
        
        // Creamos una nueva fecha normalizada sin componente de hora
        const fechaFiltroNormalizada = new Date(añoFiltro, mesFiltro, diaFiltro, 0, 0, 0, 0);
        
        // 3. Verificar todas las tareas una por una
        const totalTareas = tareasFiltradas.length;

        
        // 4. Crear un rango para todo el día
        const inicioDia = new Date(añoFiltro, mesFiltro, diaFiltro, 0, 0, 0, 0);
        const finDia = new Date(añoFiltro, mesFiltro, diaFiltro, 23, 59, 59, 999);
        

        
        // 5. Iterar y verificar coincidencia exacta por componentes de fecha
        tareasConFechaCoincidente = tareasFiltradas.filter(tarea => {
          // Ignorar tareas sin fecha límite
          if (!tarea.due_date) {
            return false;
          }
          
          // Procesar la fecha de la tarea
          try {
            const fechaTareaOriginal = new Date(tarea.due_date);
            
            // Verificar que sea una fecha válida
            if (isNaN(fechaTareaOriginal.getTime())) {
              console.warn(`⚠️ Tarea ${tarea.id} tiene fecha inválida: ${tarea.due_date}`);
              return false;
            }
            
            // Normalizar también la fecha de la tarea (solo componentes año/mes/día)
            const fechaTarea = new Date(
              fechaTareaOriginal.getFullYear(),
              fechaTareaOriginal.getMonth(),
              fechaTareaOriginal.getDate(),
              0, 0, 0, 0
            );
            
            // Comparación de timestamp normalizado (solo fecha, sin hora)
            const coincide = +fechaTarea === +fechaFiltroNormalizada;
            
            // Método alternativo: comparar componentes individuales
            const coincideComponentes = (
              fechaTarea.getFullYear() === añoFiltro &&
              fechaTarea.getMonth() === mesFiltro &&
              fechaTarea.getDate() === diaFiltro
            );
            

            

            
            return coincide;
          } catch (error) {

            return false;
          }
        });
        
        // 6. Actualizar estado final y mostrar resultados
        const cantidadCoincidentes = tareasConFechaCoincidente.length;

        
        // Aplicar el filtro
        if (cantidadCoincidentes > 0) {
          tareasFiltradas = tareasConFechaCoincidente;
        } else {
          tareasFiltradas = [];
        }
      } catch (error) {
        console.error('⛔️ ERROR GRAVE EN FILTRO DE FECHA:', error);
      }
    }
    
    // SOLUCIÓN DEFINITIVA - Filtro por asignación
    if ((filtrosFinales.asignado || filtrosFinales.assigned_to) && 
        (filtrosFinales.asignado !== 'todas' || filtrosFinales.assigned_to !== 'todos')) {
      // Obtenemos el valor real del filtro (puede estar en cualquiera de los dos campos)
      const valorFiltro = filtrosFinales.asignado || filtrosFinales.assigned_to;

      
      // Asegurar que tenemos un valor válido
      if (valorFiltro === '' || valorFiltro === 'todas' || valorFiltro === 'todos') {

        return tareasFiltradas; // No filtrar con estos valores
      }
      
      const tareasAntes = tareasFiltradas.length;

      
      // Verificar si es filtro para "asignadas" o "sin asignar"
      const esModoAsignadas = valorFiltro === 'si';
      const esModoSinAsignar = valorFiltro === 'no' || valorFiltro === 'sin_asignar';
      

      
      // Filtrar según el modo
      tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
        // Determinar si la tarea está asignada
        const tareaAsignada = tarea.assigned_to !== undefined && tarea.assigned_to !== null && tarea.assigned_to !== '';
        
        // Casos de filtrado:
        // 1. Modo "Asignadas": mostrar solo tareas con assigned_to definido
        if (esModoAsignadas) {
          const resultado = tareaAsignada;
          if (!resultado) {

          }
          return resultado;
        }
        
        // 2. Modo "Sin asignar": mostrar solo tareas sin assigned_to
        if (esModoSinAsignar) {
          const resultado = !tareaAsignada;
          if (!resultado) {
            console.log(`❌ FILTRO SIN ASIGNAR: Excluyendo tarea ${tarea.id} - Ya tiene asignación: ${tarea.assigned_to}`);
          }
          return resultado;
        }
        
        // 3. Usuario específico: coincidir con el ID
        const coincideUsuario = tarea.assigned_to === valorFiltro;
        if (!coincideUsuario) {
          console.log(`❌ FILTRO USUARIO: Excluyendo tarea ${tarea.id} - Asignada a '${tarea.assigned_to}' en vez de '${valorFiltro}'`);
        }
        return coincideUsuario;
      });
      
      const tareasDespues = tareasFiltradas.length;
      console.log(`🏁 RESULTADO FILTRO ASIGNACIÓN: ${tareasDespues}/${tareasAntes} tareas pasan el filtro`);
      
      if (tareasDespues === 0) {
        console.warn(`⚠️ NO HAY TAREAS QUE COINCIDAN CON EL FILTRO DE ASIGNACIÓN: ${valorFiltro}`);
      } else {

      }
    }
    
    // Filtro por texto en título o descripción
    if (filtrosFinales.texto && filtrosFinales.texto.trim() !== '') {
      const textoLower = filtrosFinales.texto.toLowerCase().trim();

      
      const tareasAntes = tareasFiltradas.length;
      
      tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
        // Si la tarea no tiene título ni descripción, la excluimos al buscar texto
        if (!tarea.title && !tarea.description) return false;
        
        // Si tiene título, buscamos en él
        const tituloMatch = tarea.title ? tarea.title.toLowerCase().includes(textoLower) : false;
        // Si tiene descripción, buscamos en ella
        const descMatch = tarea.description ? tarea.description.toLowerCase().includes(textoLower) : false;
        
        const coincide = tituloMatch || descMatch;
        

        
        return coincide;
      });
      
      const tareasDespues = tareasFiltradas.length;

      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {

      }
    }
    
    // Filtro por periodo de tiempo (timeframe)
    if (filtrosFinales.timeframe && filtrosFinales.timeframe !== 'todas' && filtrosFinales.timeframe !== 'todos') {

      
      // Usamos la fecha actual como referencia para todos los cálculos
      const fechaActual = new Date();
      console.log(`📅 Fecha actual de referencia: ${format(fechaActual, 'yyyy-MM-dd')}`);
      
      const tareasAntes = tareasFiltradas.length;
      
      // Variables para almacenar rango de fechas
      let fechaInicio: Date = fechaActual;
      let fechaFin: Date = fechaActual;
      
      switch (filtrosFinales.timeframe) {
        case 'hoy':
          // Rango para hoy: desde 00:00 hasta 23:59:59 de hoy
          fechaInicio = startOfDay(fechaActual);
          fechaFin = endOfDay(fechaActual);

          break;
          
        case 'semana':
          // Semana actual (lunes a domingo)
          fechaInicio = startOfWeek(fechaActual, { locale: es, weekStartsOn: 1 }); // Lunes
          fechaFin = endOfWeek(fechaActual, { locale: es, weekStartsOn: 1 });     // Domingo

          break;
          
        case 'mes':
          fechaInicio = startOfMonth(fechaActual);
          fechaFin = endOfMonth(fechaActual);

          break;
          
        default:

          return tareasFiltradas;
      }
      

      

      
      tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
        // Si la tarea no tiene fecha límite, EXCLUIMOS la tarea para filtros temporales
        if (!tarea.due_date) {

          return false;
        }
        
        try {
          // Convertimos la fecha al formato correcto (asegurando que sea una fecha UTC consistente)
          let fechaLimite: Date;
          
          // Si la fecha viene como string de Supabase (ISO format)
          if (typeof tarea.due_date === 'string') {
            // Asegurarse de que la fecha esté en formato ISO
            fechaLimite = parseISO(tarea.due_date);
          } else {
            // Si ya es un objeto Date
            fechaLimite = new Date(tarea.due_date);
          }
          
          // Normalizar a fecha local sin hora para comparación consistente
          fechaLimite = startOfDay(fechaLimite);
          
          // Verificamos que sea una fecha válida
          if (isNaN(fechaLimite.getTime())) {
            console.warn(`Fecha inválida encontrada: ${tarea.due_date} - Excluyendo tarea`);
            return false; // Excluimos tareas con fechas inválidas
          }
          
          // Verificamos si está dentro del rango establecido por el filtro
          const dentroDePeriodo = isWithinInterval(fechaLimite, { 
            start: fechaInicio, 
            end: fechaFin 
          });
          
          // Reducimos la cantidad de logs para evitar sobrecarga en consola
          if (Math.random() < 0.2) { // Solo mostramos aproximadamente 20% de los logs
            if (dentroDePeriodo) {
              console.log(`✓ Tarea INCLUIDA en filtro ${filtrosFinales.timeframe}: ${tarea.title} - ${format(fechaLimite, 'yyyy-MM-dd')}`);
            } else {
              console.log(`✗ Tarea EXCLUIDA de filtro ${filtrosFinales.timeframe}: ${tarea.title} - ${format(fechaLimite, 'yyyy-MM-dd')}`);
            }
          }
          
          return dentroDePeriodo;
        } catch (error) {
          console.error(`Error al procesar fecha: ${tarea.due_date}`, error);
          return false; // Excluimos tareas con fechas que causan errores
        }
      });
      
      const tareasDespues = tareasFiltradas.length;
      console.log(`✅ RESULTADO: Filtradas ${tareasDespues}/${tareasAntes} tareas para periodo='${filtrosFinales.timeframe}'`);
      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {
        console.warn(`⚠️ NO HAY TAREAS PARA EL PERIODO '${filtrosFinales.timeframe.toUpperCase()}' SELECCIONADO`);
      }
    }
    
    // Filtro por fecha específica (día exacto)
    if (filtrosFinales.fecha && filtrosFinales.fecha !== '') {
      console.log('📅 FILTRANDO POR FECHA ESPECÍFICA:', filtrosFinales.fecha);
      
      const tareasAntes = tareasFiltradas.length;
      
      // Convertir a fecha
      const fechaFiltro = new Date(filtrosFinales.fecha);
      fechaFiltro.setHours(0, 0, 0, 0); // Inicio del día
      
      const fechaFiltroFin = new Date(filtrosFinales.fecha);
      fechaFiltroFin.setHours(23, 59, 59, 999); // Fin del día
      
      tareasFiltradas = tareasFiltradas.filter((tarea: Task) => {
        if (!tarea.due_date) return false;
        
        const fechaTarea = new Date(tarea.due_date);
        return fechaTarea >= fechaFiltro && fechaTarea <= fechaFiltroFin;
      });
      
      const tareasDespues = tareasFiltradas.length;
      console.log(`✅ RESULTADO: Filtradas ${tareasDespues}/${tareasAntes} tareas para fecha='${filtrosFinales.fecha}'`);
      
      // Si no hay tareas filtradas, mostramos una advertencia clara
      if (tareasDespues === 0) {
        console.warn(`⚠️ NO HAY TAREAS PARA LA FECHA ${filtrosFinales.fecha}`);
      }
    }
    
    return tareasFiltradas;
  }, []);

  /**
   * Carga los nombres de los usuarios asignados a las tareas
   * @param tareas Lista de tareas a procesar
   * @returns Un mapa de IDs de usuario a nombres
   */
  const cargarUsuariosAsignados = useCallback(async (tareas: Task[]) => {
    // Verificamos que el parámetro sea válido
    if (!tareas || !Array.isArray(tareas)) {
      console.warn('cargarUsuariosAsignados: Parámetro tareas no válido', tareas);
      return {};
    }
    
    try {
      console.log(`Iniciando carga de usuarios para ${tareas.length} tareas`);
      
      // Extraemos IDs de usuarios únicos de las tareas con validación extra
      const userIds = Array.from(new Set(
        tareas
          .filter(tarea => tarea && tarea.assigned_to && typeof tarea.assigned_to === 'string' && tarea.assigned_to.trim() !== '')
          .map(tarea => tarea.assigned_to)
      ));
      
      if (userIds.length === 0) {
        console.log('No hay usuarios asignados que cargar');
        return {};
      }
      
      console.log(`Cargando datos para ${userIds.length} usuarios asignados: [${userIds.join(', ')}]`);
      
      // Consultar perfiles de usuarios
      const { data: perfilesUsuarios, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds as string[]);
        
      if (error) {
        console.error('Error al cargar perfiles de usuarios:', error);
        // No lanzamos excepciones, devolvemos objeto vacío para que el flujo continúe
        return {};
      }
      
      // Verificar que tenemos datos antes de procesarlos
      if (!perfilesUsuarios || !Array.isArray(perfilesUsuarios)) {
        console.warn('No se recibieron datos válidos de perfiles de usuarios');
        return {};
      }
      
      // Crear mapa de IDs a nombres
      const mapaUsuarios: Record<string, string> = {};
      
      perfilesUsuarios.forEach(perfil => {
        try {
          if (!perfil || !perfil.id) return;
          
          const nombreCompleto = perfil.first_name && perfil.last_name
            ? `${perfil.first_name} ${perfil.last_name}`
            : perfil.email || 'Usuario sin nombre';
            
          mapaUsuarios[perfil.id] = nombreCompleto;
        } catch (perfilError) {
          console.error('Error procesando perfil individual:', perfilError);
          // Continuamos con el siguiente perfil
        }
      });
      
      console.log(`Mapa de usuarios creado con ${Object.keys(mapaUsuarios).length} entradas`);
      return mapaUsuarios;
    } catch (error) {
      console.error('Error al procesar usuarios:', error);
      // No interrumpimos el flujo principal con toast
      console.warn('Continuando sin datos de usuarios');
      return {};
    }
  }, []);

  /**
   * Carga los nombres de clientes y oportunidades relacionados con las tareas
   * @param tareas Lista de tareas para procesar
   * @returns Un mapa de IDs de clientes/oportunidades a nombres
   */
  const cargarClientesOportunidades = useCallback(async (tareas: Task[]) => {
    try {
      // Mapa para almacenar todos los nombres de clientes y oportunidades
      const mapaFinal: Record<string, string> = {};
      
      // Verificamos que el parámetro sea válido
      if (!tareas || !Array.isArray(tareas) || tareas.length === 0) {
        console.log('No hay tareas con relaciones para cargar');
        return mapaFinal;
      }
      
      // Extraer IDs únicos de clientes y oportunidades
      const entityIds = Array.from(new Set(
        tareas
          .filter(tarea => tarea && tarea.related_to_id && tarea.related_to_id.trim() !== '')
          .map(tarea => tarea.related_to_id)
      ));
      
      if (entityIds.length === 0) {
        console.log('No hay entidades relacionadas que cargar');
        return mapaFinal;
      }
      
      // Cargar datos de oportunidades relacionadas
      const { data: oportunidades, error: errorOps } = await supabase
        .from('opportunities')
        .select('id, name')
        .in('id', entityIds as string[]);
        
      if (errorOps) {
        console.error('Error al cargar oportunidades:', errorOps);
      } else if (oportunidades && oportunidades.length > 0) {
        oportunidades.forEach((op: { id: string; name: string | null }) => {
          if (op && op.id) {
            mapaFinal[op.id] = op.name || 'Oportunidad sin nombre';
          }
        });
      }
      
      try {
        // Cargar datos de clientes relacionados directamente
        // CORRECCIÓN: Usamos los campos correctos de la tabla 'customers'
        const { data: clientesDirectos, error: errorClientesDir } = await supabase
          .from('customers')
          .select('id, full_name, first_name, last_name')
          .in('id', entityIds as string[]);
          
        if (errorClientesDir) {
          console.error('Error al cargar clientes directos:', errorClientesDir);
          // Registrar el error completo para diagnóstico
          console.log('Detalles del error:', JSON.stringify(errorClientesDir));
        } else if (clientesDirectos && clientesDirectos.length > 0) {
          console.log(`Clientes encontrados: ${clientesDirectos.length}`);
          clientesDirectos.forEach((cliente: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null }) => {
            if (cliente && cliente.id) {
              // Usamos full_name que ya está en la tabla, o construimos el nombre con first_name y last_name
              const nombreCompleto = cliente.full_name || 
                ((cliente.first_name || '') + ' ' + (cliente.last_name || '')).trim() || 
                'Cliente sin nombre';
              mapaFinal[cliente.id] = nombreCompleto;
            }
          });
          console.log(`Cargados ${clientesDirectos.length} clientes relacionados`);
        }
      } catch (error) {
        console.error('Error al intentar cargar datos de clientes:', error);
        // Continuamos con el proceso aunque falle la carga de clientes
      }
      
      return mapaFinal;
    } catch (error) {
      console.error('Error al cargar nombres de clientes/oportunidades:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos relacionados',
        variant: 'destructive'
      });
      return {};
    }
  }, [toast]);
  
  /**
   * Enriquece las tareas con datos de usuarios y entidades relacionadas
   * @param tareas Lista de tareas a enriquecer
   * @returns Lista de tareas con datos adicionales
   */
  const enriquecerTareas = useCallback(async (tareas: Task[]) => {
    try {
      // Cargar datos de usuarios asignados
      const mapaUsuarios = await cargarUsuariosAsignados(tareas);
      
      // Cargar datos de clientes y oportunidades
      const mapaRelaciones = await cargarClientesOportunidades(tareas);
      
      // Enriquecer tareas con nombres de usuarios y entidades relacionadas
      const tareasEnriquecidas = tareas.map(tarea => {
        // Crear copia para no mutar el original
        const tareaCopia: any = {...tarea};
        
        // Añadir nombre del usuario asignado
        if (tarea.assigned_to && mapaUsuarios[tarea.assigned_to]) {
          tareaCopia.assigned_to_name = mapaUsuarios[tarea.assigned_to];
        }
        
        // Añadir nombre de la entidad relacionada
        if (tarea.related_to_id && mapaRelaciones[tarea.related_to_id]) {
          tareaCopia.related_name = mapaRelaciones[tarea.related_to_id];
        }
        
        return tareaCopia;
      });
      
      console.log(`Enriquecidas ${tareasEnriquecidas.length} tareas con datos adicionales`);
      return tareasEnriquecidas;
    } catch (error) {
      console.error('Error al enriquecer tareas:', error);
      // Devolvemos las tareas originales si hay error en el enriquecimiento
      return tareas;
    }
  }, [cargarUsuariosAsignados, cargarClientesOportunidades]);

  /**
   * Función centralizada para cargar y filtrar tareas (SIMPLIFICADA)
   * @param filtrosOriginales Filtros a aplicar a las tareas
   * @returns Lista de tareas procesadas (filtradas y enriquecidas)
   */
  const cargarTareasFiltradas = useCallback(async (filtrosOriginales: TaskFilter): Promise<Task[]> => {
    console.log('\n🚨🚨🚨 ===== FUNCIÓN cargarTareasFiltradas INICIADA ===== 🚨🚨🚨');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('📝 Filtros recibidos:', filtrosOriginales);
    console.log('📊 Estado actual tareasProcesadas.length:', tareasProcesadas.length);
    
    // Establecer el estado de carga
    setCargando(true);
    
    // Almacenar el filtro actual para referencia
    setFiltroActual(filtrosOriginales);
    
    // Establecemos un timeout de seguridad para garantizar que cargando se restablezca
    const timeoutId = setTimeout(() => {
      console.warn('TIMEOUT DE SEGURIDAD ACTIVADO - Tiempo de espera agotado al cargar las tareas');
      setCargando(false);
      toast({
        title: 'Error',
        description: 'Tiempo de espera agotado al cargar las tareas',
        variant: 'destructive'
      });
    }, 10000); // 10 segundos como tiempo máximo para la carga
    
    try {
      console.log('🚨 INICIANDO PROCESO DE CARGA DE TAREAS CON FILTROS');
      console.log('📋 Filtros originales recibidos:', JSON.stringify(filtrosOriginales));

      // Verificar primero si hay un filtro de fecha - PRIORIDAD MÁXIMA
      if (filtrosOriginales.fecha && filtrosOriginales.fecha !== '') {
        console.log('🚨🚨 DETECTADO FILTRO DE FECHA CON PRIORIDAD MÁXIMA:', filtrosOriginales.fecha);
        console.log('🚨🚨 APLICANDO SOLO ESTE FILTRO E IGNORANDO OTROS');
        
        // Crear un filtro limpio con solo la fecha
        const filtroFechaPrioritario: TaskFilter = {
          fecha: filtrosOriginales.fecha
        };
      
        // 1. Cargar todas las tareas
        const todasLasTareas = await cargarTodasLasTareas();
        setTareas(todasLasTareas); // Actualizamos el estado principal de tareas
        console.log(`🔍 Total de tareas cargadas para filtro de fecha: ${todasLasTareas.length}`);
        
        // 2. Aplicar SOLO el filtro de fecha (alta prioridad)
        const tareasFiltradas = aplicarFiltrosTareas(todasLasTareas, filtroFechaPrioritario);
        console.log(`📊 Tareas que coinciden con la fecha ${filtrosOriginales.fecha}: ${tareasFiltradas.length}`);
        
        // 3. Enriquecer las tareas con información adicional
        const tareasProcesadasFinal = await enriquecerTareas(tareasFiltradas);
        
        // 4. Actualizar estado unificado de tareas procesadas
        setTareasProcesadas(tareasProcesadasFinal);
        
        // 5. Limpiar timeout y finalizar carga
        clearTimeout(timeoutId);
        setCargando(false);
        
        return tareasProcesadasFinal;
      }
      
      // Limpiar filtros para evitar problemas con valores vacíos o 'todas'
      const filtrosLimpios: TaskFilter = {};
      Object.entries(filtrosOriginales).forEach(([key, value]) => {
        if (value && value !== '' && value !== 'todas' && value !== 'todos') {
          filtrosLimpios[key as keyof TaskFilter] = value;
        }
      });
      
      console.log('💼 Filtros limpios a aplicar:', JSON.stringify(filtrosLimpios));
      
      // 1. Cargar todas las tareas primero
      const todasLasTareas = await cargarTodasLasTareas();
      setTareas(todasLasTareas); // Actualizamos el estado principal de tareas
      console.log('💾 Total de tareas cargadas:', todasLasTareas.length);
      
      if (!todasLasTareas || todasLasTareas.length === 0) {
        console.log('⚠️ No se encontraron tareas para aplicar filtros');
        setTareasProcesadas([]); // Actualizamos estado con array vacío
        setCargando(false);
        clearTimeout(timeoutId);
        return [];
      }
      
      // 2. Aplicar los filtros a las tareas cargadas
      console.log('🔍 Aplicando filtros a tareas...');
      const tareasFiltradas = aplicarFiltrosTareas(todasLasTareas, filtrosLimpios);
      console.log(`📊 Quedaron ${tareasFiltradas.length} tareas después de aplicar filtros`);
      
      // 3. Enriquecer con datos relacionados
      const tareasProcesadasFinal = await enriquecerTareas(tareasFiltradas);
      console.log(`✨ Mostrando ${tareasProcesadasFinal.length} tareas filtradas y enriquecidas`);
      
      // 4. Actualizar estado unificado
      console.log('🚨 ACTUALIZANDO ESTADO tareasProcesadas con:', tareasProcesadasFinal.length, 'tareas');
      console.log('📊 Estado anterior tareasProcesadas.length:', tareasProcesadas.length);
      setTareasProcesadas(tareasProcesadasFinal);
      console.log('✅ setTareasProcesadas EJECUTADO - Nuevo estado debe ser:', tareasProcesadasFinal.length, 'tareas');
      
      return tareasProcesadasFinal;
    } catch (error) {
      console.error('❌ Error al cargar tareas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tareas',
        variant: 'destructive'
      });
      
      // En caso de error, limpiar los estados
      setTareasProcesadas([]);
      return [];
    } finally {
      // Aseguramos que se limpie el timeout y se actualice el estado de carga
      clearTimeout(timeoutId);
      setCargando(false);
    }
  }, [cargarTodasLasTareas, enriquecerTareas, aplicarFiltrosTareas, toast]);
  
  return {
    cargarTareasFiltradas,
    cargarTodasLasTareas,
    aplicarFiltrosTareas,
    enriquecerTareas,
    // Exportamos los estados centralizados simplificados
    tareas,
    // Exponemos tareasProcesadas para reemplazar tanto tareasFiltradas como tareasEnriquecidas
    tareasFiltradas: tareasProcesadas, // Para compatibilidad con código existente
    tareasEnriquecidas: tareasProcesadas, // Para compatibilidad con código existente
    tareasProcesadas, // Nuevo estado unificado
    filtroActual,     // Estado del filtro actual aplicado
    cargando,
    setCargando
  };
}

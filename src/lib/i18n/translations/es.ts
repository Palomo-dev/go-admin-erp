/**
 * Traducciones en Español para el módulo de Campañas CRM
 */

export const es = {
  campaigns: {
    // Títulos y navegación
    title: 'Gestión de Campañas',
    subtitle: 'Administra y monitorea tus campañas de marketing',
    newCampaign: 'Nueva Campaña',
    createCampaign: 'Crear Campaña',
    
    // Filtros y búsqueda
    filters: {
      searchPlaceholder: 'Buscar campañas...',
      status: 'Estado',
      channel: 'Canal',
      allStatuses: 'Todos los estados',
      allChannels: 'Todos los canales'
    },
    
    // Estados de campaña
    status: {
      draft: 'Borrador',
      scheduled: 'Programada',
      sending: 'Enviando',
      sent: 'Enviada',
      unknown: 'Desconocido'
    },
    
    // Canales
    channels: {
      email: 'Email',
      whatsapp: 'WhatsApp',
      sms: 'SMS',
      unknown: '-'
    },
    
    // Columnas de la tabla
    table: {
      campaign: 'Campaña',
      segment: 'Segmento',
      status: 'Estado',
      date: 'Fecha',
      kpis: 'KPIs',
      actions: 'Acciones'
    },
    
    // KPIs y métricas
    kpis: {
      sent: 'Envíos',
      delivered: 'Entregados',
      opened: 'Aperturas',
      clicked: 'Clics',
      openRate: 'Open Rate',
      clickRate: 'Click Rate',
      conversion: 'Conversión',
      contacts: 'contactos'
    },
    
    // Paginación
    pagination: {
      showing: 'Mostrando',
      to: 'a',
      of: 'de',
      campaigns: 'campañas',
      previous: 'Anterior',
      next: 'Siguiente'
    },
    
    // Estados vacíos
    empty: {
      title: 'No hay campañas',
      createFirst: 'Crea tu primera campaña para comenzar',
      noResults: 'No se encontraron campañas con los filtros aplicados'
    },
    
    // Resumen general
    summary: {
      title: 'Resumen General',
      totalCampaigns: 'Campañas',
      sentCampaigns: 'Enviadas',
      scheduledCampaigns: 'Programadas',
      draftCampaigns: 'Borradores'
    },
    
    // Formulario de campaña
    form: {
      name: 'Nombre de la campaña',
      namePlaceholder: 'Ingresa el nombre de la campaña',
      channel: 'Canal',
      channelPlaceholder: 'Selecciona un canal',
      segment: 'Segmento',
      segmentPlaceholder: 'Selecciona un segmento',
      scheduledAt: 'Fecha de programación',
      description: 'Descripción',
      descriptionPlaceholder: 'Describe tu campaña...',
      save: 'Guardar Campaña',
      cancel: 'Cancelar',
      saving: 'Guardando...'
    },
    
    // Validaciones
    validation: {
      nameRequired: 'El nombre es requerido',
      channelRequired: 'El canal es requerido',
      segmentRequired: 'El segmento es requerido',
      futureDateRequired: 'La fecha de programación debe ser futura'
    },
    
    // Mensajes de éxito/error
    messages: {
      loadError: 'Error al cargar las campañas',
      saveSuccess: 'Campaña guardada exitosamente',
      saveError: 'Error al guardar la campaña',
      connectionError: 'Error de conexión al cargar las campañas'
    }
  },
  
  // Términos generales
  common: {
    loading: 'Cargando...',
    error: 'Error',
    success: 'Éxito',
    warning: 'Advertencia',
    info: 'Información',
    close: 'Cerrar',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    view: 'Ver',
    search: 'Buscar',
    filter: 'Filtrar',
    sort: 'Ordenar',
    refresh: 'Actualizar'
  }
};

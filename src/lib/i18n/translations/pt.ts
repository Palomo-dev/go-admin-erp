/**
 * Traduções em Português para o módulo de Campanhas CRM
 */

export const pt = {
  campaigns: {
    // Títulos e navegação
    title: 'Gestão de Campanhas',
    subtitle: 'Gerencie e monitore suas campanhas de marketing',
    newCampaign: 'Nova Campanha',
    createCampaign: 'Criar Campanha',
    
    // Filtros e pesquisa
    filters: {
      searchPlaceholder: 'Pesquisar campanhas...',
      status: 'Status',
      channel: 'Canal',
      allStatuses: 'Todos os status',
      allChannels: 'Todos os canais'
    },
    
    // Status das campanhas
    status: {
      draft: 'Rascunho',
      scheduled: 'Agendada',
      sending: 'Enviando',
      sent: 'Enviada',
      unknown: 'Desconhecido'
    },
    
    // Canais
    channels: {
      email: 'Email',
      whatsapp: 'WhatsApp',
      sms: 'SMS',
      unknown: '-'
    },
    
    // Colunas da tabela
    table: {
      campaign: 'Campanha',
      segment: 'Segmento',
      status: 'Status',
      date: 'Data',
      kpis: 'KPIs',
      actions: 'Ações'
    },
    
    // KPIs e métricas
    kpis: {
      sent: 'Enviados',
      delivered: 'Entregues',
      opened: 'Abertos',
      clicked: 'Clicados',
      openRate: 'Taxa de Abertura',
      clickRate: 'Taxa de Clique',
      conversion: 'Conversão',
      contacts: 'contatos'
    },
    
    // Paginação
    pagination: {
      showing: 'Mostrando',
      to: 'a',
      of: 'de',
      campaigns: 'campanhas',
      previous: 'Anterior',
      next: 'Próximo'
    },
    
    // Estados vazios
    empty: {
      title: 'Nenhuma campanha',
      createFirst: 'Crie sua primeira campanha para começar',
      noResults: 'Nenhuma campanha encontrada com os filtros aplicados'
    },
    
    // Resumo geral
    summary: {
      title: 'Resumo Geral',
      totalCampaigns: 'Campanhas',
      sentCampaigns: 'Enviadas',
      scheduledCampaigns: 'Agendadas',
      draftCampaigns: 'Rascunhos'
    },
    
    // Formulário de campanha
    form: {
      name: 'Nome da campanha',
      namePlaceholder: 'Digite o nome da campanha',
      channel: 'Canal',
      channelPlaceholder: 'Selecione um canal',
      segment: 'Segmento',
      segmentPlaceholder: 'Selecione um segmento',
      scheduledAt: 'Data de agendamento',
      description: 'Descrição',
      descriptionPlaceholder: 'Descreva sua campanha...',
      save: 'Salvar Campanha',
      cancel: 'Cancelar',
      saving: 'Salvando...'
    },
    
    // Validações
    validation: {
      nameRequired: 'O nome é obrigatório',
      channelRequired: 'O canal é obrigatório',
      segmentRequired: 'O segmento é obrigatório',
      futureDateRequired: 'A data de agendamento deve ser futura'
    },
    
    // Mensagens de sucesso/erro
    messages: {
      loadError: 'Erro ao carregar as campanhas',
      saveSuccess: 'Campanha salva com sucesso',
      saveError: 'Erro ao salvar a campanha',
      connectionError: 'Erro de conexão ao carregar as campanhas'
    }
  },
  
  // Termos gerais
  common: {
    loading: 'Carregando...',
    error: 'Erro',
    success: 'Sucesso',
    warning: 'Aviso',
    info: 'Informação',
    close: 'Fechar',
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Excluir',
    edit: 'Editar',
    view: 'Ver',
    search: 'Buscar',
    filter: 'Filtrar',
    sort: 'Ordenar',
    refresh: 'Atualizar'
  }
};

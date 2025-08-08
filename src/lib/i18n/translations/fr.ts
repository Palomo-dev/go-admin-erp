/**
 * Traductions en Français pour le module de Campagnes CRM
 */

export const fr = {
  campaigns: {
    // Titres et navigation
    title: 'Gestion des Campagnes',
    subtitle: 'Gérez et surveillez vos campagnes marketing',
    newCampaign: 'Nouvelle Campagne',
    createCampaign: 'Créer une Campagne',
    
    // Filtres et recherche
    filters: {
      searchPlaceholder: 'Rechercher des campagnes...',
      status: 'Statut',
      channel: 'Canal',
      allStatuses: 'Tous les statuts',
      allChannels: 'Tous les canaux'
    },
    
    // Statuts des campagnes
    status: {
      draft: 'Brouillon',
      scheduled: 'Programmée',
      sending: 'En cours d\'envoi',
      sent: 'Envoyée',
      unknown: 'Inconnu'
    },
    
    // Canaux
    channels: {
      email: 'Email',
      whatsapp: 'WhatsApp',
      sms: 'SMS',
      unknown: '-'
    },
    
    // Colonnes du tableau
    table: {
      campaign: 'Campagne',
      segment: 'Segment',
      status: 'Statut',
      date: 'Date',
      kpis: 'KPIs',
      actions: 'Actions'
    },
    
    // KPIs et métriques
    kpis: {
      sent: 'Envoyés',
      delivered: 'Livrés',
      opened: 'Ouverts',
      clicked: 'Cliqués',
      openRate: 'Taux d\'ouverture',
      clickRate: 'Taux de clic',
      conversion: 'Conversion',
      contacts: 'contacts'
    },
    
    // Pagination
    pagination: {
      showing: 'Affichage',
      to: 'à',
      of: 'sur',
      campaigns: 'campagnes',
      previous: 'Précédent',
      next: 'Suivant'
    },
    
    // États vides
    empty: {
      title: 'Aucune campagne',
      createFirst: 'Créez votre première campagne pour commencer',
      noResults: 'Aucune campagne trouvée avec les filtres appliqués'
    },
    
    // Résumé général
    summary: {
      title: 'Résumé Général',
      totalCampaigns: 'Campagnes',
      sentCampaigns: 'Envoyées',
      scheduledCampaigns: 'Programmées',
      draftCampaigns: 'Brouillons'
    },
    
    // Formulaire de campagne
    form: {
      name: 'Nom de la campagne',
      namePlaceholder: 'Saisissez le nom de la campagne',
      channel: 'Canal',
      channelPlaceholder: 'Sélectionnez un canal',
      segment: 'Segment',
      segmentPlaceholder: 'Sélectionnez un segment',
      scheduledAt: 'Date de programmation',
      description: 'Description',
      descriptionPlaceholder: 'Décrivez votre campagne...',
      save: 'Enregistrer la Campagne',
      cancel: 'Annuler',
      saving: 'Enregistrement...'
    },
    
    // Validations
    validation: {
      nameRequired: 'Le nom est requis',
      channelRequired: 'Le canal est requis',
      segmentRequired: 'Le segment est requis',
      futureDateRequired: 'La date de programmation doit être future'
    },
    
    // Messages de succès/erreur
    messages: {
      loadError: 'Erreur lors du chargement des campagnes',
      saveSuccess: 'Campagne enregistrée avec succès',
      saveError: 'Erreur lors de l\'enregistrement de la campagne',
      connectionError: 'Erreur de connexion lors du chargement des campagnes'
    }
  },
  
  // Termes généraux
  common: {
    loading: 'Chargement...',
    error: 'Erreur',
    success: 'Succès',
    warning: 'Avertissement',
    info: 'Information',
    close: 'Fermer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    view: 'Voir',
    search: 'Rechercher',
    filter: 'Filtrer',
    sort: 'Trier',
    refresh: 'Actualiser'
  }
};

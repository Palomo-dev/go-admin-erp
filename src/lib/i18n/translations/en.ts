/**
 * English translations for CRM Campaigns module
 */

export const en = {
  campaigns: {
    // Titles and navigation
    title: 'Campaign Management',
    subtitle: 'Manage and monitor your marketing campaigns',
    newCampaign: 'New Campaign',
    createCampaign: 'Create Campaign',
    
    // Filters and search
    filters: {
      searchPlaceholder: 'Search campaigns...',
      status: 'Status',
      channel: 'Channel',
      allStatuses: 'All statuses',
      allChannels: 'All channels'
    },
    
    // Campaign statuses
    status: {
      draft: 'Draft',
      scheduled: 'Scheduled',
      sending: 'Sending',
      sent: 'Sent',
      unknown: 'Unknown'
    },
    
    // Channels
    channels: {
      email: 'Email',
      whatsapp: 'WhatsApp',
      sms: 'SMS',
      unknown: '-'
    },
    
    // Table columns
    table: {
      campaign: 'Campaign',
      segment: 'Segment',
      status: 'Status',
      date: 'Date',
      kpis: 'KPIs',
      actions: 'Actions'
    },
    
    // KPIs and metrics
    kpis: {
      sent: 'Sent',
      delivered: 'Delivered',
      opened: 'Opened',
      clicked: 'Clicked',
      openRate: 'Open Rate',
      clickRate: 'Click Rate',
      conversion: 'Conversion',
      contacts: 'contacts'
    },
    
    // Pagination
    pagination: {
      showing: 'Showing',
      to: 'to',
      of: 'of',
      campaigns: 'campaigns',
      previous: 'Previous',
      next: 'Next'
    },
    
    // Empty states
    empty: {
      title: 'No campaigns',
      createFirst: 'Create your first campaign to get started',
      noResults: 'No campaigns found with the applied filters'
    },
    
    // General summary
    summary: {
      title: 'General Summary',
      totalCampaigns: 'Campaigns',
      sentCampaigns: 'Sent',
      scheduledCampaigns: 'Scheduled',
      draftCampaigns: 'Drafts'
    },
    
    // Campaign form
    form: {
      name: 'Campaign name',
      namePlaceholder: 'Enter campaign name',
      channel: 'Channel',
      channelPlaceholder: 'Select a channel',
      segment: 'Segment',
      segmentPlaceholder: 'Select a segment',
      scheduledAt: 'Scheduled date',
      description: 'Description',
      descriptionPlaceholder: 'Describe your campaign...',
      save: 'Save Campaign',
      cancel: 'Cancel',
      saving: 'Saving...'
    },
    
    // Validations
    validation: {
      nameRequired: 'Name is required',
      channelRequired: 'Channel is required',
      segmentRequired: 'Segment is required',
      futureDateRequired: 'Scheduled date must be in the future'
    },
    
    // Success/error messages
    messages: {
      loadError: 'Error loading campaigns',
      saveSuccess: 'Campaign saved successfully',
      saveError: 'Error saving campaign',
      connectionError: 'Connection error while loading campaigns'
    }
  },
  
  // General terms
  common: {
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    info: 'Information',
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    refresh: 'Refresh'
  }
};

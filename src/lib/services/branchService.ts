import { supabase } from '@/lib/supabase/config';
import { Branch, OpeningHours, DayHours } from '@/types/branch';
import { GeocodingService } from './geocodingService';

// Helper function to normalize opening hours format
const normalizeOpeningHours = (openingHours: any): OpeningHours | null => {
  if (!openingHours) return null;
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const normalized: OpeningHours = {};
  
  days.forEach(day => {
    const dayHours = openingHours[day];
    if (dayHours) {
      // Ensure the day hours have the correct format
      normalized[day as keyof OpeningHours] = {
        open: dayHours.open || '09:00',
        close: dayHours.close || '18:00',
        closed: typeof dayHours.closed === 'boolean' ? dayHours.closed : (!dayHours.open || !dayHours.close)
      };
    }
  });
  
  return normalized;
};

export const branchService = {
  /**
   * Get all branches for an organization
   */
  async getBranches(organizationId: number): Promise<Branch[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('organization_id', organizationId)
      
    if (error) {
      console.error('Error fetching branches:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Get a single branch by ID
   */
  async getBranchById(branchId: number): Promise<Branch> {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    if (error) {
      console.error('Error fetching branch:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Create a new branch
   */
  async createBranch(branch: Branch): Promise<Branch> {
    try {
      // Clean and format the branch data - only include columns that exist in DB
      const formattedBranch = {
        organization_id: branch.organization_id,
        name: branch.name,
        address: branch.address || null,
        city: branch.city || null,
        state: branch.state || null,
        country: branch.country || null,
        postal_code: branch.postal_code || null,
        latitude: branch.latitude || null,
        longitude: branch.longitude || null,
        phone: branch.phone || null,
        email: branch.email || null,
        manager_id: branch.manager_id || null,
        is_main: branch.is_main ?? false,
        tax_identification: branch.tax_identification || null,
        // Handle JSON fields - normalize opening hours
        opening_hours: normalizeOpeningHours(
          typeof branch.opening_hours === 'string' && branch.opening_hours
            ? JSON.parse(branch.opening_hours)
            : branch.opening_hours
        ),
        features: typeof branch.features === 'string' && branch.features
          ? JSON.parse(branch.features)
          : branch.features || null,
        capacity: branch.capacity || null,
        branch_type: branch.branch_type || null,
        zone: branch.zone || null,
        branch_code: branch.branch_code,
        is_active: branch.is_active ?? true
      };

      const { data, error } = await supabase
        .from('branches')
        .insert([formattedBranch])
        .select()
        .single();

      if (error) {
        console.error('Error creating branch:', error, error.details, error.hint);
        throw new Error(`Error al crear sucursal: ${error.message}`);
      }

      return data;
    } catch (err: any) {
      console.error('Error in createBranch:', err);
      if (err.message.includes('invalid input syntax for type uuid')) {
        throw new Error('Error: El ID del gerente debe ser un UUID válido o estar vacío');
      }
      throw new Error(err.message || 'Error al crear la sucursal');
    }
  },

  /**
   * Update an existing branch
   */
  async updateBranch(branchId: number, branch: Partial<Branch>): Promise<Branch> {
    // Format branch data - only include columns that exist in DB
    const formattedBranch: any = {};
    
    // Only include fields that are provided and exist in the database
    if (branch.name !== undefined) formattedBranch.name = branch.name;
    if (branch.address !== undefined) formattedBranch.address = branch.address;
    if (branch.city !== undefined) formattedBranch.city = branch.city;
    if (branch.state !== undefined) formattedBranch.state = branch.state;
    if (branch.country !== undefined) formattedBranch.country = branch.country;
    if (branch.postal_code !== undefined) formattedBranch.postal_code = branch.postal_code;
    if (branch.latitude !== undefined) formattedBranch.latitude = branch.latitude;
    if (branch.longitude !== undefined) formattedBranch.longitude = branch.longitude;
    if (branch.phone !== undefined) formattedBranch.phone = branch.phone;
    if (branch.email !== undefined) formattedBranch.email = branch.email;
    if (branch.manager_id !== undefined) formattedBranch.manager_id = branch.manager_id;
    if (branch.is_main !== undefined) formattedBranch.is_main = branch.is_main;
    if (branch.tax_identification !== undefined) formattedBranch.tax_identification = branch.tax_identification;
    if (branch.capacity !== undefined) formattedBranch.capacity = branch.capacity;
    if (branch.branch_type !== undefined) formattedBranch.branch_type = branch.branch_type;
    if (branch.zone !== undefined) formattedBranch.zone = branch.zone;
    if (branch.branch_code !== undefined) formattedBranch.branch_code = branch.branch_code;
    if (branch.is_active !== undefined) formattedBranch.is_active = branch.is_active;
    
    // Handle JSON fields - normalize opening hours
    if (branch.opening_hours !== undefined) {
      const parsedHours = typeof branch.opening_hours === 'string' 
        ? JSON.parse(branch.opening_hours) 
        : branch.opening_hours;
      formattedBranch.opening_hours = normalizeOpeningHours(parsedHours);
    }
    if (branch.features !== undefined) {
      formattedBranch.features = typeof branch.features === 'string' 
        ? JSON.parse(branch.features) 
        : branch.features;
    }

    const { data, error } = await supabase
      .from('branches')
      .update(formattedBranch)
      .eq('id', branchId)
      .select()
      .single();

    if (error) {
      console.error('Error updating branch:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Delete a branch
   */
  async deleteBranch(branchId: number): Promise<void> {
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) {
      console.error('Error deleting branch:', error);
      throw new Error(error.message);
    }
  },

  /**
   * Toggle branch active status
   */
  async toggleBranchStatus(branchId: number, isActive: boolean): Promise<Branch> {
    const { data, error } = await supabase
      .from('branches')
      .update({ is_active: isActive })
      .eq('id', branchId)
      .select()
      .single();

    if (error) {
      console.error('Error toggling branch status:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Set a branch as the main branch
   */
  async setMainBranch(organizationId: number, branchId: number): Promise<void> {
    // First, unset all branches as main
    const { error: resetError } = await supabase
      .from('branches')
      .update({ is_main: false })
      .eq('organization_id', organizationId);

    if (resetError) {
      console.error('Error resetting main branch status:', resetError);
      throw new Error(resetError.message);
    }

    // Then set the selected branch as main
    const { error } = await supabase
      .from('branches')
      .update({ is_main: true })
      .eq('id', branchId);

    if (error) {
      console.error('Error setting main branch:', error);
      throw new Error(error.message);
    }
  },

  /**
   * Assign or update a manager for a branch
   */
  async assignManager(branchId: number, managerId: string | null): Promise<Branch> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .update({ manager_id: managerId })
        .eq('id', branchId)
        .select('*')
        .single();

      if (error) {
        console.error('Error assigning manager to branch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Error assigning manager:', error);
      throw error;
    }
  },

  /**
   * Get branches with their manager information
   */
  async getBranchesWithManagers(organizationId: number): Promise<(Branch & { manager?: any })[]> {
    const { data, error } = await supabase
      .from('branches')
      .select(`
        *,
        manager:profiles(id, first_name, last_name, email, avatar_url)
      `)
      .eq('organization_id', organizationId);
      
    if (error) {
      console.error('Error fetching branches with managers:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Generate a unique branch code
   */
  async generateBranchCode(organizationId: number, branchName: string): Promise<string> {
    try {
      // Get existing branch codes for this organization
      const { data: existingBranches, error } = await supabase
        .from('branches')
        .select('branch_code')
        .eq('organization_id', organizationId);
      
      if (error) {
        console.error('Error fetching existing branch codes:', error);
        throw new Error(error.message);
      }

      const existingCodes = new Set(existingBranches?.map(b => b.branch_code) || []);
      
      // Generate code based on branch name
      const baseCode = branchName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 4) || 'BRANCH';
      
      // Try with base code first, then add numbers
      let counter = 1;
      let proposedCode = baseCode;
      
      while (existingCodes.has(proposedCode)) {
        proposedCode = `${baseCode}${counter.toString().padStart(3, '0')}`;
        counter++;
      }
      
      return proposedCode;
    } catch (error) {
      console.error('Error generating branch code:', error);
      throw error;
    }
  },

  /**
   * Geocode a branch and update its coordinates
   */
  async geocodeBranch(branchId: number): Promise<Branch> {
    try {
      // First get the branch
      const branch = await this.getBranchById(branchId);
      
      // Use the geocoding service
      const updatedBranch = await GeocodingService.geocodeBranch(branch);
      
      return updatedBranch;
    } catch (error) {
      console.error('Error geocoding branch:', error);
      throw error;
    }
  },

  /**
   * Geocode multiple branches for an organization
   */
  async geocodeOrganizationBranches(
    organizationId: number,
    onProgress?: (current: number, total: number, branchName: string) => void
  ): Promise<{ success: Branch[], errors: any[] }> {
    try {
      const branches = await this.getBranches(organizationId);
      const branchesWithoutCoords = branches.filter(b => !b.latitude || !b.longitude);
      
      if (branchesWithoutCoords.length === 0) {
        return { success: branches, errors: [] };
      }

      const result = await GeocodingService.geocodeMultipleBranches(
        branchesWithoutCoords,
        onProgress
      );

      return result;
    } catch (error) {
      console.error('Error geocoding organization branches:', error);
      throw error;
    }
  },

  /**
   * Update branch coordinates manually
   */
  async updateBranchCoordinates(
    branchId: number, 
    latitude: number, 
    longitude: number
  ): Promise<Branch> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .update({ latitude, longitude })
        .eq('id', branchId)
        .select()
        .single();

      if (error) {
        console.error('Error updating branch coordinates:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Error updating branch coordinates:', error);
      throw error;
    }
  },

  /**
   * Find the nearest branch to given coordinates
   */
  async findNearestBranch(
    organizationId: number,
    targetLat: number,
    targetLng: number
  ): Promise<{ branch: Branch, distance: number } | null> {
    try {
      const branches = await this.getBranches(organizationId);
      return GeocodingService.findNearestBranch(targetLat, targetLng, branches);
    } catch (error) {
      console.error('Error finding nearest branch:', error);
      throw error;
    }
  },

  /**
   * Get branches with coordinate status
   */
  async getBranchesWithLocationStatus(organizationId: number): Promise<{
    withCoordinates: Branch[],
    withoutCoordinates: Branch[],
    total: number
  }> {
    try {
      const branches = await this.getBranches(organizationId);
      
      const withCoordinates = branches.filter(b => b.latitude && b.longitude);
      const withoutCoordinates = branches.filter(b => !b.latitude || !b.longitude);
      
      return {
        withCoordinates,
        withoutCoordinates,
        total: branches.length
      };
    } catch (error) {
      console.error('Error getting branches location status:', error);
      throw error;
    }
  }
};

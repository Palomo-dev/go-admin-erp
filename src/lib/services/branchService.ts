import { supabase } from '@/lib/supabase/config';
import { Branch } from '@/types/branch';

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
      // Clean and format the branch data
      const formattedBranch = {
        ...branch,
        // Handle JSON fields
        opening_hours: typeof branch.opening_hours === 'string' && branch.opening_hours
          ? JSON.parse(branch.opening_hours)
          : branch.opening_hours || null,
        features: typeof branch.features === 'string' && branch.features
          ? JSON.parse(branch.features)
          : branch.features || null,
        // Handle UUID fields
        manager_id: branch.manager_id || null,
        // Ensure required fields
        organization_id: branch.organization_id,
        name: branch.name,
        branch_code: branch.branch_code,
        is_active: branch.is_active ?? true,
        is_main: branch.is_main ?? false
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
    // Format opening_hours and features as JSONB if they're strings
    const formattedBranch = {
      ...branch,
      opening_hours: typeof branch.opening_hours === 'string' 
        ? JSON.parse(branch.opening_hours) 
        : branch.opening_hours,
      features: typeof branch.features === 'string' 
        ? JSON.parse(branch.features) 
        : branch.features
    };

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
   * Generate a unique branch code
   */
  async generateBranchCode(organizationId: number, branchName: string): Promise<string> {
    // Get organization prefix (first 3 letters of organization name)
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      console.error('Error fetching organization:', orgError);
      throw new Error(orgError.message);
    }

    const orgPrefix = orgData.name.substring(0, 3).toUpperCase();
    
    // Get count of existing branches for this organization
    const { count, error: countError } = await supabase
      .from('branches')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (countError) {
      console.error('Error counting branches:', countError);
      throw new Error(countError.message);
    }

    // Generate branch code: ORG-BRN-001
    const branchNumber = (count !== null ? count + 1 : 1).toString().padStart(3, '0');
    const branchPrefix = branchName.substring(0, 3).toUpperCase();
    
    return `${orgPrefix}-${branchPrefix}-${branchNumber}`;
  }
};

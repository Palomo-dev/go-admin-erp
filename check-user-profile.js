// Script temporal para verificar si existe el perfil del usuario
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgmgphmzusbluqhuqihj.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbWdwaG16dXNibHVxaHVxaWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwMzQ1MjIsImV4cCI6MjA2MTYxMDUyMn0.yr5TLl2nhevIzNdPnjVkcdn049RB2t2OgqPG0HryVR4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserProfile() {
  console.log('🔍 Verificando perfil para: santy.cano@hotmail.com');
  
  try {
    // Verificar en la tabla auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error al consultar usuarios auth:', authError);
    } else {
      const user = authUsers.users.find(u => u.email === 'santy.cano@hotmail.com');
      if (user) {
        console.log('✅ Usuario encontrado en auth.users:');
        console.log('  - ID:', user.id);
        console.log('  - Email:', user.email);
        console.log('  - Email confirmado:', user.email_confirmed_at ? 'Sí' : 'No');
        console.log('  - Último login:', user.last_sign_in_at);
        console.log('  - Creado:', user.created_at);
        console.log('  - Metadata:', JSON.stringify(user.user_metadata, null, 2));
        
        // Ahora verificar si existe el perfil
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (profileError) {
          console.log('❌ Error al consultar perfil:', profileError);
          if (profileError.code === 'PGRST116') {
            console.log('❌ El perfil NO EXISTE para este usuario');
          }
        } else {
          console.log('✅ Perfil encontrado:');
          console.log('  - ID:', profileData.id);
          console.log('  - Email:', profileData.email);
          console.log('  - Nombre:', profileData.first_name, profileData.last_name);
          console.log('  - Organización:', profileData.last_org_id);
          console.log('  - Estado:', profileData.status);
          console.log('  - Creado:', profileData.created_at);
        }
        
        // Verificar organizaciones
        const { data: orgData, error: orgError } = await supabase
          .from('organization_members')
          .select('*, organizations(name)')
          .eq('user_id', user.id);
        
        if (!orgError && orgData?.length > 0) {
          console.log('✅ Membresías de organización:');
          orgData.forEach(org => {
            console.log(`  - Org ID: ${org.organization_id}, Nombre: ${org.organizations?.name}, Rol: ${org.role}`);
          });
        } else {
          console.log('❌ No se encontraron membresías de organización');
        }
        
      } else {
        console.log('❌ Usuario NO encontrado en auth.users');
      }
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

checkUserProfile().then(() => {
  console.log('\n✅ Verificación completada');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error en la verificación:', error);
  process.exit(1);
});

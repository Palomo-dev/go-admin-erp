'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/config';

export default function InviteTest() {
  const [inviteCode, setInviteCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('No session found');
        return;
      }
      
      // Generate a random code
      const code = Math.random().toString(36).substring(2, 10);
      
      // Get organization ID from the user's profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single();
      
      if (!profileData?.organization_id) {
        setError('No organization found for user');
        return;
      }
      
      // Create an invitation
      const { data, error } = await supabase
        .from('invitations')
        .insert([
          {
            email: `test-${Date.now()}@example.com`,
            code,
            role_id: 3, // Assuming 3 is a valid role ID
            organization_id: profileData.organization_id,
            created_by: session.user.id,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending'
          }
        ])
        .select();
      
      if (error) {
        throw error;
      }
      
      setInviteCode(code);
      setResult(data);
    } catch (err: any) {
      console.error('Error generating invite:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Invitation Test Tool</h1>
      
      <button
        onClick={handleGenerateInvite}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
      >
        {loading ? 'Generating...' : 'Generate Test Invitation'}
      </button>
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          {error}
        </div>
      )}
      
      {inviteCode && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">Invitation Generated</h2>
          <p className="mt-2">
            <span className="font-bold">Code:</span> {inviteCode}
          </p>
          <p className="mt-2">
            <span className="font-bold">Invitation URL:</span>{' '}
            <a 
              href={`/auth/invite?code=${inviteCode}`}
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {`${window.location.origin}/auth/invite?code=${inviteCode}`}
            </a>
          </p>
        </div>
      )}
      
      {result && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">Response Data</h2>
          <pre className="mt-2 p-4 bg-gray-100 rounded overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

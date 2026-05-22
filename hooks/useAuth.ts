'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export function useAuth(requireAuth = true) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (requireAuth && !data.session) router.replace('/');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
      if (requireAuth && !session) router.replace('/');
    });

    return () => sub.subscription.unsubscribe();
  }, [requireAuth, router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const userName = user?.user_metadata?.nombre
    || user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || 'Admin';

  return { user, loading, logout, userName };
}

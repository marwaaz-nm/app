import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// created_by columns across surveys/references/transfers store the auth user's uuid,
// not a display name — this resolves those ids to the profile's fullname so record
// lists can show "Added by <Name>" instead of a raw uuid.
export function useProfileNames() {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('id, fullname');
      if (!active || error || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as { id: string; fullname: string | null }[]) {
        if (row.fullname) map[row.id] = row.fullname;
      }
      setNames(map);
    })();
    return () => {
      active = false;
    };
  }, []);

  return names;
}

// created_by is sometimes a uuid (resolve via the profiles map) and sometimes already
// a plain name string (e.g. financial records that store profile.fullname directly).
export function resolveCreatorName(createdBy: string | null | undefined, names: Record<string, string>): string | null {
  if (!createdBy) return null;
  return names[createdBy] || createdBy;
}

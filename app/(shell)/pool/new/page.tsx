import { redirect } from 'next/navigation';

import { CreateFlow } from '@/features/pool/create-flow';
import { getMyProfile } from '@/lib/queries/profile';
import { createClient } from '@/lib/supabase/server';

/** "Open a new Pool" (H23; 1c): a white page above the water. */
export default async function NewPoolPage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');
  return <CreateFlow />;
}

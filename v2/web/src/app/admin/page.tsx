import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { decodeAal } from '@/lib/aal';
import { readManagementCounts } from '@/lib/admin-management-counts';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AdminDashboard from './dashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Panel de Administración', description: 'Panel de administración de Franky.', robots: { index: false, follow: false } };

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== user.id || decodeAal(session?.access_token) !== 'aal2') redirect('/perfil/seguridad?mfa=required&next=/admin');
  const { data: profile } = await supabase.from('profiles').select('role,is_discarded').eq('id', user.id).single();
  if (!profile || !['admin', 'analyst'].includes(profile.role) || profile.is_discarded === true) redirect('/');

  try {
    const [stats, recent] = await Promise.all([
      readManagementCounts(supabase),
      supabase.from('profiles')
        .select('id, full_name, email, created_at, role, is_discarded, strikes_count, looking_for_housing, looking_for_roommate')
        .not('is_discarded', 'is', true).order('created_at', { ascending: false }).limit(10),
    ]);
    if (recent.error || !recent.data) throw new Error('admin_users_unavailable');
    return <AdminDashboard viewerId={user.id} stats={stats} recentUsers={recent.data} readOnly={profile.role !== 'admin'} />;
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <p className="eyebrow">Panel de administración</p>
        <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">No hemos podido cargar el panel completo</h1>
        <p role="alert" className="mt-3 text-text-muted">
          Ha fallado una consulta del inventario. Vuelve a intentarlo para consultar cifras actualizadas.
        </p>
        <a href="/admin" className={cn(buttonVariants({ variant: 'default' }), 'mt-8')}>Reintentar</a>
      </main>
    );
  }
}
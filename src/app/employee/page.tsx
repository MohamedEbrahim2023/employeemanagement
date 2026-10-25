import React from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function EmployeeDashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('task_assignments')
      .select('id, status, progress_percentage, latest_progress_note, updated_at, tasks(title, priority, due_date)')
      .eq('employee_id', user.id)
      .neq('status', 'canceled')
  ]);

  if (!profile || profile.account_status !== 'active') {
    redirect('/login?error=account_inactive');
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile.full_name}</h1>
        <p className="text-sm text-slate-600">
          Track your assigned tasks, update progress history, and submit completed work for review.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Assigned Tasks</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{(assignments ?? []).length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">In Progress</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {(assignments ?? []).filter((a) => a.status === 'in_progress').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Approved Completed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {(assignments ?? []).filter((a) => a.status === 'approved').length}
          </p>
        </div>
      </section>
    </main>
  );
}

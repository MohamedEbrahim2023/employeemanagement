import React from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AdminDashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!roleRecord || roleRecord.role !== 'admin') {
    redirect('/employee');
  }

  const [{ data: employees }, { data: assignments }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, department, job_title, account_status, last_active_at')
      .eq('organization_id', roleRecord.organization_id)
      .is('deleted_at', null),
    supabase
      .from('task_assignments')
      .select('id, status, progress_percentage, task_id, employee_id, updated_at')
      .eq('organization_id', roleRecord.organization_id)
  ]);

  const validAssignments = (assignments ?? []).filter((a) => a.status !== 'canceled');
  const approvedCount = validAssignments.filter((a) => a.status === 'approved').length;
  const completionRate =
    validAssignments.length > 0 ? ((approvedCount / validAssignments.length) * 100).toFixed(1) : '0.0';

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administrative Dashboard</h1>
          <p className="text-sm text-slate-600">
            Real-time organization performance, employee directory, and task review center
          </p>
        </div>
      </header>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Total Employees</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{(employees ?? []).length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Total Active Assignments</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{validAssignments.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Approved Completions</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{approvedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Overall Completion Rate</p>
          <p className="mt-2 text-3xl font-bold text-indigo-700">{completionRate}%</p>
        </div>
      </section>
    </main>
  );
}

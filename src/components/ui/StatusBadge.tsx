import React from 'react';
import type { AssignmentStatus } from '@/types/database';

interface StatusBadgeProps {
  status: AssignmentStatus;
  isOverdue?: boolean;
  label: string;
}

/**
 * Accessible status indicator using color + semantic text + distinct icon glyph.
 * Never relies on color alone (WCAG 2.2 AA).
 */
export function StatusBadge({ status, isOverdue = false, label }: StatusBadgeProps) {
  if (isOverdue && status !== 'approved' && status !== 'canceled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        <span aria-hidden="true">⚠</span>
        <span>{label}</span>
      </span>
    );
  }

  const styles: Record<AssignmentStatus, { cls: string; icon: string }> = {
    approved: {
      cls: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
      icon: '✓'
    },
    in_progress: {
      cls: 'bg-blue-50 text-blue-800 ring-blue-600/20',
      icon: '●'
    },
    awaiting_review: {
      cls: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      icon: '⏳'
    },
    not_started: {
      cls: 'bg-slate-100 text-slate-700 ring-slate-500/20',
      icon: '○'
    },
    rejected: {
      cls: 'bg-red-50 text-red-800 ring-red-600/20',
      icon: '↺'
    },
    canceled: {
      cls: 'bg-slate-100 text-slate-500 line-through ring-slate-400/20',
      icon: '✕'
    }
  };

  const current = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${current.cls}`}>
      <span aria-hidden="true">{current.icon}</span>
      <span>{label}</span>
    </span>
  );
}

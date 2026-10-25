'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from './client';

interface UseRealtimeAssignmentsOptions {
  organizationId: string;
  userId: string;
  role: 'admin' | 'employee';
  onEvent: () => void;
}

/**
 * Subscribes to Supabase Realtime changes for assignments, progress updates,
 * and user notifications with automatic cleanup on unmount.
 */
export function useRealtimeWorkspaceSync({
  organizationId,
  userId,
  role,
  onEvent
}: UseRealtimeAssignmentsOptions) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`org-workspace-${organizationId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`
        },
        () => onEvent()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignments',
          filter: role === 'admin' ? `organization_id=eq.${organizationId}` : `employee_id=eq.${userId}`
        },
        () => onEvent()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, userId, role, onEvent]);
}

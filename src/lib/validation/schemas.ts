import { z } from 'zod';

export const UUIDSchema = z.string().uuid('Invalid UUID format');

export const CreateEmployeeSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(255),
  department: z.string().trim().max(80).optional().nullable(),
  job_title: z.string().trim().max(100).optional().nullable(),
  employee_number: z.string().trim().max(40).optional().nullable(),
  account_status: z.enum(['invited', 'active', 'deactivated']).default('invited'),
  avatar_url: z.string().url().optional().nullable()
});

export const UpdateEmployeeAdminSchema = CreateEmployeeSchema.partial().extend({
  id: UUIDSchema
});

export const UpdateOwnProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  avatar_url: z.string().url().optional().nullable()
}).strict();

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(3, 'Task title must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().trim().max(80).optional().nullable(),
  start_date: z.string().datetime(),
  due_date: z.string().datetime(),
  estimated_effort_hours: z.number().positive().max(2000).optional().nullable(),
  completion_criteria: z.string().trim().max(2000).optional().nullable(),
  checklist: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().trim().min(1).max(300),
      done: z.boolean().default(false)
    })
  ).default([]),
  assigned_employee_ids: z.array(UUIDSchema).min(1, 'At least one employee must be assigned')
}).refine((data) => new Date(data.due_date).getTime() >= new Date(data.start_date).getTime(), {
  message: 'Deadline must be on or after the start date',
  path: ['due_date']
});

export const RecordProgressSchema = z.object({
  assignment_id: UUIDSchema,
  new_percentage: z.number().int().min(0, 'Progress cannot be less than 0%').max(100, 'Progress cannot exceed 100%'),
  description: z.string().trim().min(5, 'Please provide a meaningful description (min 5 chars)').max(3000),
  blockers: z.string().trim().max(2000).optional().nullable(),
  next_steps: z.string().trim().max(2000).optional().nullable(),
  idempotency_key: z.string().trim().min(4).max(128).optional(),
  expected_version: z.number().int().positive().optional()
});

export const SubmitTaskSchema = z.object({
  assignment_id: UUIDSchema,
  submission_summary: z.string().trim().min(10, 'Completion summary must be at least 10 characters').max(4000),
  evidence_links: z.array(z.string().url()).max(10).default([])
});

export const ReviewSubmissionSchema = z.object({
  assignment_id: UUIDSchema,
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  review_notes: z.string().trim().max(3000).optional().nullable(),
  quality_bonus: z.number().int().min(0).max(20).default(0)
}).refine(
  (data) => data.decision === 'approved' || (data.review_notes && data.review_notes.trim().length >= 5),
  {
    message: 'A clear explanation (at least 5 characters) is required when rejecting or requesting changes',
    path: ['review_notes']
  }
);

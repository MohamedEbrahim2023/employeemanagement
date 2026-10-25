'use client';

import React, { useState, useMemo } from 'react';

export interface ScoreInput {
  totalAssigned: number;
  completedApproved: number;
  onTimeCompleted: number;
  averageProgressPercentage: number;
  averageReviewDelayHours: number;
}

export interface ScoreOutput {
  completionRate: number;
  onTimeRate: number;
  speedScore: number;
  totalScore: number;
}

export function calculateLeaderboardScore(input: ScoreInput): ScoreOutput {
  const completionRate =
    input.totalAssigned > 0
      ? Math.round((input.completedApproved / input.totalAssigned) * 100)
      : 0;
  const onTimeRate =
    input.completedApproved > 0
      ? Math.round((input.onTimeCompleted / input.completedApproved) * 100)
      : 100;
  const speedScore = Math.max(
    0,
    Math.min(100, Math.round(100 - input.averageReviewDelayHours * 4))
  );

  const weighted =
    completionRate * 0.4 +
    onTimeRate * 0.35 +
    input.averageProgressPercentage * 0.15 +
    speedScore * 0.1;

  return {
    completionRate,
    onTimeRate,
    speedScore,
    totalScore: Math.round(weighted * 10) / 10,
  };
}

export function computeKpiMetrics(
  taskList: Array<{ status: string }>,
  assignmentList: Array<{ progressPercentage: number }>
): {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completionRate: number;
  averageProgress: number;
} {
  const totalTasks = taskList.length;
  const completedTasks = taskList.filter(
    (t) => t.status === 'completed'
  ).length;
  const inProgressTasks = taskList.filter(
    (t) => t.status === 'in_progress' || t.status === 'under_review'
  ).length;
  const overdueTasks = taskList.filter((t) => t.status === 'overdue').length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const averageProgress =
    assignmentList.length > 0
      ? Math.round(
          assignmentList.reduce((acc, a) => acc + a.progressPercentage, 0) /
            assignmentList.length
        )
      : 0;

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    overdueTasks,
    completionRate,
    averageProgress,
  };
}

export function sanitizeCsvCell(val: string | number): string {
  const str = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export interface CsvRowInput {
  rank: number;
  employeeCode: string;
  fullName: string;
  department: string;
  completedTasks: number;
  onTimeRate: string;
  totalScore: number;
}

export function generateLeaderboardCsv(rows: CsvRowInput[]): string {
  const headers = [
    'Rank',
    'Employee Code',
    'Full Name',
    'Department',
    'Approved Tasks',
    'On-Time Rate',
    'Weighted Score',
  ];
  const lines = rows.map((r: CsvRowInput) =>
    [
      r.rank,
      `"${sanitizeCsvCell(r.employeeCode).replace(/"/g, '""')}"`,
      `"${sanitizeCsvCell(r.fullName).replace(/"/g, '""')}"`,
      `"${sanitizeCsvCell(r.department).replace(/"/g, '""')}"`,
      r.completedTasks,
      `"${sanitizeCsvCell(r.onTimeRate)}"`,
      r.totalScore,
    ].join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export interface EmployeeRecord {
  id: string;
  employee_code: string;
  full_name_ar: string;
  full_name_en: string;
  email: string;
  job_title_ar: string;
  job_title_en: string;
  department_ar: string;
  department_en: string;
  phone: string;
  status: 'active' | 'suspended';
  role: 'admin' | 'employee';
  hire_date: string;
  avgDelayHours: number;
}

export interface AssignmentRecord {
  id: string;
  employee_id: string;
  progress_percentage: number;
  individual_status:
    | 'not_started'
    | 'in_progress'
    | 'submitted_for_review'
    | 'approved'
    | 'rejected'
    | 'overdue';
  last_progress_note: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  task_code: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status:
    | 'new'
    | 'in_progress'
    | 'under_review'
    | 'completed'
    | 'overdue'
    | 'cancelled';
  start_date: string;
  due_date: string;
  created_by: string;
  assignments: AssignmentRecord[];
}

export interface ProgressLogRecord {
  id: string;
  task_id: string;
  employee_id: string;
  previous_percentage: number;
  new_percentage: number;
  note: string;
  created_at: string;
}

export interface SubmissionRecord {
  id: string;
  task_id: string;
  employee_id: string;
  completion_comment: string;
  deliverable_url: string;
  submitted_at: string;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewer_comment: string;
  reviewed_at: string | null;
}

export interface NotificationRecord {
  id: string;
  recipient_id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLogRecord {
  id: string;
  actor_ar: string;
  actor_en: string;
  action_type: string;
  desc_ar: string;
  desc_en: string;
  created_at: string;
}

const INITIAL_EMPLOYEES: EmployeeRecord[] = [
  {
    id: 'admin-1',
    employee_code: 'EMP-0001',
    full_name_ar: 'أحمد المنصور',
    full_name_en: 'Ahmed Al-Mansour',
    email: 'ahmed.admin@nukhba.sa',
    job_title_ar: 'المدير التنفيذي للعمليات',
    job_title_en: 'VP of Operations',
    department_ar: 'الإدارة العليا',
    department_en: 'Executive Management',
    phone: '+966 50 110 2200',
    status: 'active',
    role: 'admin',
    hire_date: '2022-01-15',
    avgDelayHours: 0,
  },
  {
    id: 'emp-1',
    employee_code: 'EMP-1042',
    full_name_ar: 'سلمى الدوسري',
    full_name_en: 'Salma Al-Dossary',
    email: 'salma@nukhba.sa',
    job_title_ar: 'مهندسة برمجيات أولى',
    job_title_en: 'Senior Software Engineer',
    department_ar: 'الهندسة والتطوير',
    department_en: 'Engineering',
    phone: '+966 55 321 8890',
    status: 'active',
    role: 'employee',
    hire_date: '2023-03-10',
    avgDelayHours: 1.2,
  },
  {
    id: 'emp-2',
    employee_code: 'EMP-1089',
    full_name_ar: 'عمر الحربي',
    full_name_en: 'Omar Al-Harbi',
    email: 'omar@nukhba.sa',
    job_title_ar: 'محلل أمن سيبراني',
    job_title_en: 'Cybersecurity Analyst',
    department_ar: 'أمن المعلومات',
    department_en: 'Information Security',
    phone: '+966 54 992 1044',
    status: 'active',
    role: 'employee',
    hire_date: '2023-07-01',
    avgDelayHours: 3.5,
  },
  {
    id: 'emp-3',
    employee_code: 'EMP-1104',
    full_name_ar: 'لينا القحطاني',
    full_name_en: 'Lina Al-Qahtani',
    email: 'lina@nukhba.sa',
    job_title_ar: 'مصممة تجربة المستخدم',
    job_title_en: 'Product Designer',
    department_ar: 'المنتجات والتصميم',
    department_en: 'Product & Design',
    phone: '+966 56 401 7721',
    status: 'active',
    role: 'employee',
    hire_date: '2023-11-20',
    avgDelayHours: 0.5,
  },
  {
    id: 'emp-4',
    employee_code: 'EMP-1150',
    full_name_ar: 'خالد العتيبي',
    full_name_en: 'Khaled Al-Otaibi',
    email: 'khaled@nukhba.sa',
    job_title_ar: 'أخصائي ضمان الجودة',
    job_title_en: 'QA Specialist',
    department_ar: 'الهندسة والتطوير',
    department_en: 'Engineering',
    phone: '+966 50 778 3312',
    status: 'active',
    role: 'employee',
    hire_date: '2024-02-01',
    avgDelayHours: 9.0,
  },
];

const INITIAL_TASKS: TaskRecord[] = [
  {
    id: 'task-101',
    task_code: 'TSK-2041',
    title_ar: 'تطوير بوابة الدفع الإلكتروني الموحدة (مدى / Apple Pay)',
    title_en: 'Unified Payment Gateway Integration (Mada / Apple Pay)',
    description_ar:
      'ربط واجهات برمجة التطبيقات لبوابة الدفع مع التحقق من التواقيع الرقمية webhook واجتياز اختبارات الأمان PCI-DSS.',
    description_en:
      'Integrate payment gateway APIs with cryptographic webhook verification and pass PCI-DSS security checks.',
    priority: 'urgent',
    status: 'under_review',
    start_date: '2025-05-01',
    due_date: '2025-05-18',
    created_by: 'admin-1',
    assignments: [
      {
        id: 'asg-1',
        employee_id: 'emp-1',
        progress_percentage: 100,
        individual_status: 'submitted_for_review',
        last_progress_note:
          'تم إكمال الربط البرمجي ورفع تقرير الفحص الأمني للمراجعة.',
        updated_at: 'منذ 15 دقيقة',
      },
      {
        id: 'asg-2',
        employee_id: 'emp-2',
        progress_percentage: 85,
        individual_status: 'in_progress',
        last_progress_note: 'جاري مراجعة سجلات التشفير النهائية.',
        updated_at: 'منذ ساعة',
      },
    ],
  },
  {
    id: 'task-102',
    task_code: 'TSK-2042',
    title_ar: 'إعادة تصميم لوحة تحليلات الموارد البشرية التفاعلية',
    title_en: 'Interactive HR Analytics Dashboard Redesign',
    description_ar:
      'بناء واجهة مستخدم ثنائية اللغة تدعم العربية والإنجليزية مع رسوم بيانية فورية الأداء.',
    description_en:
      'Build a bilingual RTL/LTR user interface with real-time performance charts.',
    priority: 'high',
    status: 'completed',
    start_date: '2025-04-20',
    due_date: '2025-05-05',
    created_by: 'admin-1',
    assignments: [
      {
        id: 'asg-3',
        employee_id: 'emp-3',
        progress_percentage: 100,
        individual_status: 'approved',
        last_progress_note: 'تم تسليم ملفات Figma ومكونات React بالكامل.',
        updated_at: '2025-05-04',
      },
    ],
  },
  {
    id: 'task-103',
    task_code: 'TSK-2043',
    title_ar: 'فحص اختراق الخوادم السحابية وسياسات RLS في قاعدة البيانات',
    title_en: 'Cloud Infrastructure Penetration Test & Supabase RLS Audit',
    description_ar:
      'اختبار جميع صلاحيات الوصول في PostgreSQL والتأكد من عزل بيانات الموظفين.',
    description_en:
      'Verify all PostgreSQL RLS policies and confirm strict tenant/employee isolation.',
    priority: 'urgent',
    status: 'in_progress',
    start_date: '2025-05-05',
    due_date: '2025-05-22',
    created_by: 'admin-1',
    assignments: [
      {
        id: 'asg-4',
        employee_id: 'emp-2',
        progress_percentage: 70,
        individual_status: 'in_progress',
        last_progress_note:
          'تم الانتهاء من فحص 6 جداول رئيسية وتوثيق النتائج.',
        updated_at: 'منذ 3 ساعات',
      },
      {
        id: 'asg-5',
        employee_id: 'emp-1',
        progress_percentage: 90,
        individual_status: 'in_progress',
        last_progress_note:
          'تمت كتابة اختبارات التحقق التلقائي لـ Server Actions.',
        updated_at: 'منذ ساعتين',
      },
    ],
  },
  {
    id: 'task-104',
    task_code: 'TSK-2044',
    title_ar: 'أتمتة اختبارات الانحدار (End-to-End Regression Suite)',
    title_en: 'End-to-End Regression Test Suite Automation',
    description_ar:
      'كتابة سيناريوهات اختبار شاملة لتحديثات التقدم، الإشعارات، وتصدير التقارير.',
    description_en:
      'Write comprehensive E2E test scenarios for progress updates, notifications, and CSV exports.',
    priority: 'medium',
    status: 'overdue',
    start_date: '2025-04-15',
    due_date: '2025-05-01',
    created_by: 'admin-1',
    assignments: [
      {
        id: 'asg-6',
        employee_id: 'emp-4',
        progress_percentage: 45,
        individual_status: 'overdue',
        last_progress_note: 'تم إنجاز اختبارات الوحدة وجاري العمل على واجهة E2E.',
        updated_at: 'منذ يومين',
      },
    ],
  },
];

const INITIAL_SUBMISSIONS: SubmissionRecord[] = [
  {
    id: 'sub-1',
    task_id: 'task-101',
    employee_id: 'emp-1',
    completion_comment:
      'تم إكمال ربط بوابة الدفع بنجاح مع تفعيل التحقق من التواقيع الرقمية وتجربة 50 عملية دفع اختبارية بنسبة نجاح 100%.',
    deliverable_url: 'https://github.com/nukhba-org/payment-gateway/pull/142',
    submitted_at: '2025-05-11 10:30 ص',
    review_status: 'pending',
    reviewer_comment: '',
    reviewed_at: null,
  },
  {
    id: 'sub-2',
    task_id: 'task-102',
    employee_id: 'emp-3',
    completion_comment:
      'تم تسليم نظام التصميم المتكامل (RTL/LTR) مع توثيق جميع المكونات التفاعلية.',
    deliverable_url: 'https://figma.com/file/nukhba-design-system-v2',
    submitted_at: '2025-05-04 02:15 م',
    review_status: 'approved',
    reviewer_comment: 'عمل احترافي ودقيق جداً، تم الاعتماد.',
    reviewed_at: '2025-05-04 04:00 م',
  },
];

const INITIAL_PROGRESS_LOGS: ProgressLogRecord[] = [
  {
    id: 'pl-1',
    task_id: 'task-101',
    employee_id: 'emp-1',
    previous_percentage: 75,
    new_percentage: 100,
    note: 'تم إكمال الربط البرمجي ورفع تقرير الفحص الأمني للمراجعة.',
    created_at: 'اليوم 10:30 ص',
  },
  {
    id: 'pl-2',
    task_id: 'task-101',
    employee_id: 'emp-2',
    previous_percentage: 60,
    new_percentage: 85,
    note: 'جاري مراجعة سجلات التشفير النهائية.',
    created_at: 'اليوم 09:45 ص',
  },
  {
    id: 'pl-3',
    task_id: 'task-103',
    employee_id: 'emp-1',
    previous_percentage: 50,
    new_percentage: 90,
    note: 'تمت كتابة اختبارات التحقق التلقائي لـ Server Actions.',
    created_at: 'أمس 04:20 م',
  },
];

const INITIAL_NOTIFICATIONS: NotificationRecord[] = [
  {
    id: 'notif-1',
    recipient_id: 'admin-1',
    title_ar: 'طلب اعتماد مهمة جديد',
    title_en: 'New Task Completion Submitted',
    body_ar: 'قامت سلمى الدوسري برفع طلب إنهاء للمهمة TSK-2041 للمراجعة.',
    body_en: 'Salma Al-Dossary submitted task TSK-2041 for completion review.',
    is_read: false,
    created_at: 'منذ 15 دقيقة',
  },
  {
    id: 'notif-2',
    recipient_id: 'emp-1',
    title_ar: 'تحديث على المهمة المشتركة TSK-2041',
    title_en: 'Update on Shared Task TSK-2041',
    body_ar: 'قام عمر الحربي برفع نسبة التقدم إلى 85%.',
    body_en: 'Omar Al-Harbi updated progress to 85%.',
    is_read: false,
    created_at: 'منذ ساعة',
  },
  {
    id: 'notif-3',
    recipient_id: 'emp-3',
    title_ar: 'تم اعتماد المهمة TSK-2042',
    title_en: 'Task TSK-2042 Approved',
    body_ar:
      'اعتمدت الإدارة المهمة: إعادة تصميم لوحة تحليلات الموارد البشرية التفاعلية.',
    body_en:
      'Management approved your task: Interactive HR Analytics Dashboard Redesign.',
    is_read: true,
    created_at: '2025-05-04',
  },
];

const INITIAL_ACTIVITY_LOG: ActivityLogRecord[] = [
  {
    id: 'act-1',
    actor_ar: 'سلمى الدوسري',
    actor_en: 'Salma Al-Dossary',
    action_type: 'TASK_SUBMITTED',
    desc_ar: 'إرسال طلب إنهاء المهمة TSK-2041 للمراجعة (نسبة الإنجاز 100%)',
    desc_en: 'Submitted task TSK-2041 for completion review (Progress 100%)',
    created_at: 'اليوم 10:30 ص',
  },
  {
    id: 'act-2',
    actor_ar: 'عمر الحربي',
    actor_en: 'Omar Al-Harbi',
    action_type: 'PROGRESS_UPDATED',
    desc_ar: 'تحديث نسبة الإنجاز في TSK-2041 من 60% إلى 85%',
    desc_en: 'Updated progress on TSK-2041 from 60% to 85%',
    created_at: 'اليوم 09:45 ص',
  },
  {
    id: 'act-3',
    actor_ar: 'أحمد المنصور (المدير)',
    actor_en: 'Ahmed Al-Mansour (Admin)',
    action_type: 'REVIEW_APPROVED',
    desc_ar: 'اعتماد إنهاء المهمة TSK-2042 للموظفة لينا القحطاني',
    desc_en: 'Approved task completion TSK-2042 for Lina Al-Qahtani',
    created_at: '2025-05-04 04:00 م',
  },
];

export interface NukhbaWorkspaceAppProps {
  initialView?: 'dashboard' | 'login' | 'employee';
}

export default function NukhbaWorkspaceApp({
  initialView = 'dashboard',
}: NukhbaWorkspaceAppProps) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [currentUserId, setCurrentUserId] = useState<string>(
    initialView === 'employee' ? 'emp-1' : 'admin-1'
  );
  const [showLoginModal, setShowLoginModal] = useState<boolean>(
    initialView === 'login'
  );
  const [loginEmail, setLoginEmail] = useState<string>('ahmed.admin@nukhba.sa');
  const [loginPassword, setLoginPassword] = useState<string>('••••••••••••');

  const [activeTab, setActiveTab] = useState<string>(
    initialView === 'employee' ? 'my-tasks' : 'overview'
  );
  const [employees, setEmployees] =
    useState<EmployeeRecord[]>(INITIAL_EMPLOYEES);
  const [tasks, setTasks] = useState<TaskRecord[]>(INITIAL_TASKS);
  const [submissions, setSubmissions] =
    useState<SubmissionRecord[]>(INITIAL_SUBMISSIONS);
  const [progressLogs, setProgressLogs] = useState<ProgressLogRecord[]>(
    INITIAL_PROGRESS_LOGS
  );
  const [notifications, setNotifications] = useState<NotificationRecord[]>(
    INITIAL_NOTIFICATIONS
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>(
    INITIAL_ACTIVITY_LOG
  );

  // Filters
  const [empSearch, setEmpSearch] = useState<string>('');
  const [empDeptFilter, setEmpDeptFilter] = useState<string>('ALL');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('ALL');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('ALL');

  // Modals & UI States
  const [showNotifDropdown, setShowNotifDropdown] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // New Employee Modal
  const [showAddEmpModal, setShowAddEmpModal] = useState<boolean>(false);
  const [newEmpNameAr, setNewEmpNameAr] = useState<string>('');
  const [newEmpNameEn, setNewEmpNameEn] = useState<string>('');
  const [newEmpEmail, setNewEmpEmail] = useState<string>('');
  const [newEmpTitleAr, setNewEmpTitleAr] = useState<string>('');
  const [newEmpDeptAr, setNewEmpDeptAr] = useState<string>('الهندسة والتطوير');
  const [newEmpPhone, setNewEmpPhone] = useState<string>('+966 5');

  // New Task Modal
  const [showAddTaskModal, setShowAddTaskModal] = useState<boolean>(false);
  const [newTaskTitleAr, setNewTaskTitleAr] = useState<string>('');
  const [newTaskDescAr, setNewTaskDescAr] = useState<string>('');
  const [newTaskPriority, setNewTaskPriority] = useState<
    'low' | 'medium' | 'high' | 'urgent'
  >('high');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>('2025-05-30');
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>(['emp-1']);

  // Review Modal
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<
    string | null
  >(null);
  const [reviewerNote, setReviewerNote] = useState<string>('');

  // Employee Progress Update Modal
  const [updatingTaskObj, setUpdatingTaskObj] = useState<{
    taskId: string;
    currentPct: number;
  } | null>(null);
  const [sliderPct, setSliderPct] = useState<number>(50);
  const [progressNoteText, setProgressNoteText] = useState<string>('');

  // Employee Completion Submit Modal
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [completionCommentText, setCompletionCommentText] =
    useState<string>('');
  const [deliverableUrlText, setDeliverableUrlText] = useState<string>(
    'https://github.com/nukhba-org/repo/pull/'
  );

  const isRtl = lang === 'ar';
  const currentUser = useMemo<EmployeeRecord>(() => {
    return (
      employees.find((e: EmployeeRecord) => e.id === currentUserId) ||
      employees[0]
    );
  }, [employees, currentUserId]);

  const isAdmin = currentUser.role === 'admin';

  const triggerToast = (msg: string): void => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3800);
  };

  // Switch User Role Handler
  const handleSwitchUser = (userId: string): void => {
    setCurrentUserId(userId);
    const target = employees.find((e: EmployeeRecord) => e.id === userId);
    if (target?.role === 'admin') {
      setActiveTab('overview');
    } else {
      setActiveTab('my-tasks');
    }
    setShowLoginModal(false);
  };

  // Handle Login Submit
  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const matched = employees.find(
      (emp: EmployeeRecord) =>
        emp.email.toLowerCase() === loginEmail.trim().toLowerCase()
    );
    if (matched) {
      handleSwitchUser(matched.id);
      triggerToast(
        isRtl
          ? `مرحباً بك مجدداً، ${matched.full_name_ar}`
          : `Welcome back, ${matched.full_name_en}`
      );
    } else {
      handleSwitchUser('admin-1');
      triggerToast(
        isRtl
          ? 'تم تسجيل الدخول إلى لوحة التحكم التنفيذية'
          : 'Signed in to Executive Dashboard'
      );
    }
  };

  // KPI Metrics Calculation
  const kpiStats = useMemo(() => {
    const activeEmps = employees.filter(
      (e: EmployeeRecord) => e.role === 'employee' && e.status === 'active'
    ).length;
    const suspendedEmps = employees.filter(
      (e: EmployeeRecord) => e.role === 'employee' && e.status === 'suspended'
    ).length;

    const domainKpi = computeKpiMetrics(
      tasks.map((t: TaskRecord) => ({ status: t.status })),
      tasks.flatMap((t: TaskRecord) =>
        t.assignments.map((a: AssignmentRecord) => ({
          progressPercentage: a.progress_percentage,
        }))
      )
    );

    const pendingReviewsCount = submissions.filter(
      (s: SubmissionRecord) => s.review_status === 'pending'
    ).length;

    return {
      totalEmployees: employees.filter(
        (e: EmployeeRecord) => e.role === 'employee'
      ).length,
      activeEmps,
      suspendedEmps,
      totalTasks: domainKpi.totalTasks,
      completedTasks: domainKpi.completedTasks,
      inProgressTasks: domainKpi.inProgressTasks,
      overdueTasks: domainKpi.overdueTasks,
      pendingReviewsCount,
      avgProgress: domainKpi.averageProgress,
      completionRate: domainKpi.completionRate,
    };
  }, [employees, tasks, submissions]);

  // Leaderboard Calculation
  const leaderboardRows = useMemo(() => {
    const empList = employees.filter(
      (e: EmployeeRecord) => e.role === 'employee'
    );
    const rows = empList.map((emp: EmployeeRecord) => {
      const empAssignments = tasks.flatMap((t: TaskRecord) =>
        t.assignments
          .filter((a: AssignmentRecord) => a.employee_id === emp.id)
          .map((a: AssignmentRecord) => ({ task: t, assignment: a }))
      );
      const totalAssigned = empAssignments.length;
      const completedApproved = empAssignments.filter(
        (item: { task: TaskRecord; assignment: AssignmentRecord }) =>
          item.assignment.individual_status === 'approved' ||
          item.task.status === 'completed'
      ).length;
      const onTimeCompleted = completedApproved;
      const avgProg =
        totalAssigned > 0
          ? Math.round(
              empAssignments.reduce(
                (
                  acc: number,
                  cur: { task: TaskRecord; assignment: AssignmentRecord }
                ) => acc + cur.assignment.progress_percentage,
                0
              ) / totalAssigned
            )
          : 0;

      const scoreResult = calculateLeaderboardScore({
        totalAssigned,
        completedApproved,
        onTimeCompleted,
        averageProgressPercentage: avgProg,
        averageReviewDelayHours: emp.avgDelayHours,
      });

      return {
        emp,
        totalAssigned,
        completedApproved,
        onTimeRate: scoreResult.onTimeRate,
        avgProg,
        totalScore: scoreResult.totalScore,
      };
    });

    return rows.sort((a, b) => b.totalScore - a.totalScore);
  }, [employees, tasks]);

  // Export Safe CSV
  const handleExportCsv = (): void => {
    const csvRows = leaderboardRows.map((r, idx: number) => ({
      rank: idx + 1,
      employeeCode: sanitizeCsvCell(r.emp.employee_code),
      fullName: sanitizeCsvCell(
        isRtl ? r.emp.full_name_ar : r.emp.full_name_en
      ),
      department: sanitizeCsvCell(
        isRtl ? r.emp.department_ar : r.emp.department_en
      ),
      completedTasks: r.completedApproved,
      onTimeRate: `${r.onTimeRate}%`,
      totalScore: r.totalScore,
    }));

    const csvContent = generateLeaderboardCsv(csvRows);
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'nukhba-leaderboard-report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerToast(
      isRtl
        ? 'تم تصدير تقرير الأداء بصيغة CSV آمنة (محمية ضد CSV Injection)'
        : 'Exported protected CSV leaderboard report'
    );
  };

  // Add New Employee
  const handleCreateEmployee = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!newEmpNameAr.trim() || !newEmpEmail.trim()) return;

    const nextNum = 1155 + employees.length;
    const newEmp: EmployeeRecord = {
      id: `emp-${Date.now()}`,
      employee_code: `EMP-${nextNum}`,
      full_name_ar: newEmpNameAr.trim(),
      full_name_en: newEmpNameEn.trim() || newEmpNameAr.trim(),
      email: newEmpEmail.trim(),
      job_title_ar: newEmpTitleAr.trim() || 'أخصائي مشاريع',
      job_title_en: 'Project Specialist',
      department_ar: newEmpDeptAr,
      department_en: 'Operations & Tech',
      phone: newEmpPhone.trim(),
      status: 'active',
      role: 'employee',
      hire_date: new Date().toISOString().slice(0, 10),
      avgDelayHours: 0,
    };

    setEmployees((prev: EmployeeRecord[]) => [newEmp, ...prev]);
    setActivityLogs((prev: ActivityLogRecord[]) => [
      {
        id: `act-${Date.now()}`,
        actor_ar: currentUser.full_name_ar,
        actor_en: currentUser.full_name_en,
        action_type: 'EMPLOYEE_CREATED',
        desc_ar: `إضافة الموظف الجديد ${newEmp.full_name_ar} (${newEmp.employee_code})`,
        desc_en: `Created new employee ${newEmp.full_name_en} (${newEmp.employee_code})`,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);
    setNewEmpNameAr('');
    setNewEmpNameEn('');
    setNewEmpEmail('');
    setNewEmpTitleAr('');
    setShowAddEmpModal(false);
    triggerToast(
      isRtl
        ? `تمت إضافة الموظف ${newEmp.full_name_ar} بنجاح`
        : `Employee ${newEmp.full_name_en} added`
    );
  };

  // Toggle Employee Active/Suspended Status
  const handleToggleEmployeeStatus = (empId: string): void => {
    setEmployees((prev: EmployeeRecord[]) =>
      prev.map((e: EmployeeRecord) => {
        if (e.id !== empId) return e;
        const nextStatus = e.status === 'active' ? 'suspended' : 'active';
        return { ...e, status: nextStatus };
      })
    );
    triggerToast(
      isRtl ? 'تم تحديث حالة حساب الموظف' : 'Updated employee account status'
    );
  };

  // Add New Task
  const handleCreateTask = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!newTaskTitleAr.trim() || newTaskAssignees.length === 0) return;

    const codeNum = 2045 + tasks.length;
    const taskCode = `TSK-${codeNum}`;
    const newTaskId = `task-${Date.now()}`;

    const newTask: TaskRecord = {
      id: newTaskId,
      task_code: taskCode,
      title_ar: newTaskTitleAr.trim(),
      title_en: newTaskTitleAr.trim(),
      description_ar:
        newTaskDescAr.trim() || 'مهمة تنفيذية مسندة عبر منصة نخبة.',
      description_en: newTaskDescAr.trim() || 'Assigned operational task.',
      priority: newTaskPriority,
      status: 'new',
      start_date: new Date().toISOString().slice(0, 10),
      due_date: newTaskDueDate,
      created_by: currentUser.id,
      assignments: newTaskAssignees.map((empId: string, idx: number) => ({
        id: `asg-${Date.now()}-${idx}`,
        employee_id: empId,
        progress_percentage: 0,
        individual_status: 'not_started',
        last_progress_note: 'تم إسناد المهمة وبانتظار البدء.',
        updated_at: isRtl ? 'الآن' : 'Just now',
      })),
    };

    setTasks((prev: TaskRecord[]) => [newTask, ...prev]);

    const newNotifs: NotificationRecord[] = newTaskAssignees.map(
      (empId: string, i: number) => ({
        id: `notif-${Date.now()}-${i}`,
        recipient_id: empId,
        title_ar: `مهمة جديدة مسندة إليك (${taskCode})`,
        title_en: `New Task Assigned (${taskCode})`,
        body_ar: newTask.title_ar,
        body_en: newTask.title_en,
        is_read: false,
        created_at: isRtl ? 'الآن' : 'Just now',
      })
    );
    setNotifications((prev: NotificationRecord[]) => [...newNotifs, ...prev]);

    setActivityLogs((prev: ActivityLogRecord[]) => [
      {
        id: `act-${Date.now()}`,
        actor_ar: currentUser.full_name_ar,
        actor_en: currentUser.full_name_en,
        action_type: 'TASK_ASSIGNED',
        desc_ar: `إنشاء وإسناد المهمة ${taskCode}: ${newTask.title_ar}`,
        desc_en: `Created and assigned task ${taskCode}: ${newTask.title_en}`,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setNewTaskTitleAr('');
    setNewTaskDescAr('');
    setShowAddTaskModal(false);
    triggerToast(
      isRtl
        ? `تم إنشاء المهمة ${taskCode} وإشعار الموظفين المسندين`
        : `Task ${taskCode} created & assignees notified`
    );
  };

  // Review Submission (Approve / Reject)
  const handleReviewDecision = (
    submissionId: string,
    decision: 'approved' | 'rejected'
  ): void => {
    const sub = submissions.find(
      (s: SubmissionRecord) => s.id === submissionId
    );
    if (!sub) return;

    if (decision === 'rejected' && !reviewerNote.trim()) {
      triggerToast(
        isRtl
          ? 'يرجى كتابة سبب الرفض والملاحظات للموظف'
          : 'Please provide a rejection reason for the employee'
      );
      return;
    }

    setSubmissions((prev: SubmissionRecord[]) =>
      prev.map((s: SubmissionRecord) =>
        s.id === submissionId
          ? {
              ...s,
              review_status: decision,
              reviewer_comment:
                reviewerNote.trim() ||
                (decision === 'approved'
                  ? 'تمت المراجعة والاعتماد بنجاح.'
                  : 'يحتاج إلى تعديلات إضافية.'),
              reviewed_at: isRtl ? 'الآن' : 'Just now',
            }
          : s
      )
    );

    setTasks((prev: TaskRecord[]) =>
      prev.map((t: TaskRecord) => {
        if (t.id !== sub.task_id) return t;
        const updatedAssignments = t.assignments.map(
          (a: AssignmentRecord): AssignmentRecord => {
            if (a.employee_id !== sub.employee_id) return a;
            return {
              ...a,
              individual_status:
                decision === 'approved' ? 'approved' : 'rejected',
              progress_percentage:
                decision === 'approved' ? 100 : a.progress_percentage,
              last_progress_note:
                decision === 'approved'
                  ? 'تم اعتماد الإنجاز النهائي من الإدارة ✅'
                  : `ملاحظة المراجع: ${reviewerNote.trim()}`,
              updated_at: isRtl ? 'الآن' : 'Just now',
            };
          }
        );

        const allApproved = updatedAssignments.every(
          (a: AssignmentRecord) => a.individual_status === 'approved'
        );

        return {
          ...t,
          status: allApproved
            ? 'completed'
            : decision === 'rejected'
            ? 'in_progress'
            : t.status,
          assignments: updatedAssignments,
        };
      })
    );

    setNotifications((prev: NotificationRecord[]) => [
      {
        id: `notif-${Date.now()}`,
        recipient_id: sub.employee_id,
        title_ar:
          decision === 'approved'
            ? 'تم اعتماد إنجاز المهمة بنجاح ✅'
            : 'تمت إعادة المهمة للتعديل ⚠️',
        title_en:
          decision === 'approved'
            ? 'Task Completion Approved ✅'
            : 'Task Returned for Revision ⚠️',
        body_ar:
          reviewerNote.trim() ||
          (decision === 'approved'
            ? 'اعتمدت الإدارة طلب إنهاء المهمة الخاص بك.'
            : 'يرجى مراجعة ملاحظات المدير وإعادة الإرسال.'),
        body_en:
          reviewerNote.trim() ||
          (decision === 'approved'
            ? 'Management approved your completion request.'
            : 'Please review admin feedback and resubmit.'),
        is_read: false,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setActivityLogs((prev: ActivityLogRecord[]) => [
      {
        id: `act-${Date.now()}`,
        actor_ar: currentUser.full_name_ar,
        actor_en: currentUser.full_name_en,
        action_type:
          decision === 'approved' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
        desc_ar: `${
          decision === 'approved' ? 'اعتماد' : 'رفض وإعادة'
        } طلب إتمام المهمة (${sub.task_id})`,
        desc_en: `${
          decision === 'approved' ? 'Approved' : 'Rejected'
        } completion request (${sub.task_id})`,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setReviewingSubmissionId(null);
    setReviewerNote('');
    triggerToast(
      decision === 'approved'
        ? isRtl
          ? 'تم اعتماد المهمة وتحديث نقاط الموظف في المتصدرين'
          : 'Task approved & leaderboard updated'
        : isRtl
        ? 'تم رفض الطلب وإشعار الموظف بالملاحظات'
        : 'Submission rejected & employee notified'
    );
  };

  // Employee Updates Progress (0 - 100%)
  const handleSaveProgressUpdate = (
    e: React.FormEvent<HTMLFormElement>
  ): void => {
    e.preventDefault();
    if (!updatingTaskObj) return;

    const { taskId, currentPct } = updatingTaskObj;
    const clampedPct = Math.max(0, Math.min(100, Number(sliderPct)));
    const note =
      progressNoteText.trim() ||
      (isRtl
        ? `تحديث التقدم إلى ${clampedPct}%`
        : `Updated progress to ${clampedPct}%`);

    setTasks((prev: TaskRecord[]) =>
      prev.map((t: TaskRecord) => {
        if (t.id !== taskId) return t;
        const nextAssignments = t.assignments.map(
          (a: AssignmentRecord): AssignmentRecord => {
            if (a.employee_id !== currentUser.id) return a;
            return {
              ...a,
              progress_percentage: clampedPct,
              individual_status:
                clampedPct === 0 ? 'not_started' : 'in_progress',
              last_progress_note: note,
              updated_at: isRtl ? 'الآن' : 'Just now',
            };
          }
        );
        return {
          ...t,
          status: t.status === 'new' ? 'in_progress' : t.status,
          assignments: nextAssignments,
        };
      })
    );

    setProgressLogs((prev: ProgressLogRecord[]) => [
      {
        id: `pl-${Date.now()}`,
        task_id: taskId,
        employee_id: currentUser.id,
        previous_percentage: currentPct,
        new_percentage: clampedPct,
        note,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setActivityLogs((prev: ActivityLogRecord[]) => [
      {
        id: `act-${Date.now()}`,
        actor_ar: currentUser.full_name_ar,
        actor_en: currentUser.full_name_en,
        action_type: 'PROGRESS_UPDATED',
        desc_ar: `تحديث نسبة التقدم من ${currentPct}% إلى ${clampedPct}% — ${note}`,
        desc_en: `Updated progress from ${currentPct}% to ${clampedPct}% — ${note}`,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setUpdatingTaskObj(null);
    setProgressNoteText('');
    triggerToast(
      isRtl
        ? `تم حفظ نسبة الإنجاز (${clampedPct}%) في السجل الزمني`
        : `Saved progress (${clampedPct}%) to audit log`
    );
  };

  // Employee Submits Task Completion for Review
  const handleEmployeeSubmitCompletion = (
    e: React.FormEvent<HTMLFormElement>
  ): void => {
    e.preventDefault();
    if (!submittingTaskId || !completionCommentText.trim()) return;

    const newSub: SubmissionRecord = {
      id: `sub-${Date.now()}`,
      task_id: submittingTaskId,
      employee_id: currentUser.id,
      completion_comment: completionCommentText.trim(),
      deliverable_url: deliverableUrlText.trim(),
      submitted_at: isRtl ? 'الآن' : 'Just now',
      review_status: 'pending',
      reviewer_comment: '',
      reviewed_at: null,
    };

    setSubmissions((prev: SubmissionRecord[]) => [newSub, ...prev]);

    setTasks((prev: TaskRecord[]) =>
      prev.map((t: TaskRecord) => {
        if (t.id !== submittingTaskId) return t;
        return {
          ...t,
          status: 'under_review',
          assignments: t.assignments.map(
            (a: AssignmentRecord): AssignmentRecord =>
              a.employee_id === currentUser.id
                ? {
                    ...a,
                    progress_percentage: 100,
                    individual_status: 'submitted_for_review',
                    last_progress_note: completionCommentText.trim(),
                    updated_at: isRtl ? 'الآن' : 'Just now',
                  }
                : a
          ),
        };
      })
    );

    setNotifications((prev: NotificationRecord[]) => [
      {
        id: `notif-${Date.now()}`,
        recipient_id: 'admin-1',
        title_ar: 'طلب اعتماد مهمة جديد للمراجعة',
        title_en: 'New Task Completion Submitted for Review',
        body_ar: `أرسل ${currentUser.full_name_ar} طلب اعتماد إنهاء المهمة.`,
        body_en: `${currentUser.full_name_en} submitted a task completion request.`,
        is_read: false,
        created_at: isRtl ? 'الآن' : 'Just now',
      },
      ...prev,
    ]);

    setSubmittingTaskId(null);
    setCompletionCommentText('');
    triggerToast(
      isRtl
        ? 'تم رفع طلب اعتماد الإنهاء إلى الإدارة للمراجعة'
        : 'Submitted completion request for admin review'
    );
  };

  const getEmployeeById = (empId: string): EmployeeRecord | undefined =>
    employees.find((e: EmployeeRecord) => e.id === empId);

  const getTaskById = (tId: string): TaskRecord | undefined =>
    tasks.find((t: TaskRecord) => t.id === tId);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((e: EmployeeRecord) => e.role === 'employee')
      .filter((e: EmployeeRecord) => {
        if (empDeptFilter !== 'ALL' && e.department_ar !== empDeptFilter) {
          return false;
        }
        if (!empSearch.trim()) return true;
        const q = empSearch.toLowerCase();
        return (
          e.full_name_ar.toLowerCase().includes(q) ||
          e.full_name_en.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.employee_code.toLowerCase().includes(q)
        );
      });
  }, [employees, empDeptFilter, empSearch]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t: TaskRecord) => {
      if (taskStatusFilter !== 'ALL' && t.status !== taskStatusFilter) {
        return false;
      }
      if (taskPriorityFilter !== 'ALL' && t.priority !== taskPriorityFilter) {
        return false;
      }
      return true;
    });
  }, [tasks, taskStatusFilter, taskPriorityFilter]);

  const employeeMyTasks = useMemo(() => {
    return tasks.filter((t: TaskRecord) =>
      t.assignments.some(
        (a: AssignmentRecord) => a.employee_id === currentUser.id
      )
    );
  }, [tasks, currentUser.id]);

  const myUnreadNotifications = useMemo(() => {
    return notifications.filter(
      (n: NotificationRecord) => n.recipient_id === currentUser.id && !n.is_read
    );
  }, [notifications, currentUser.id]);

  const priorityBadge = (priority: TaskRecord['priority']) => {
    const map: Record<
      TaskRecord['priority'],
      { ar: string; en: string; cls: string }
    > = {
      urgent: {
        ar: 'عاجلة جداً',
        en: 'Urgent',
        cls: 'bg-rose-100 text-rose-800 border-rose-200',
      },
      high: {
        ar: 'عالية',
        en: 'High',
        cls: 'bg-amber-100 text-amber-800 border-amber-200',
      },
      medium: {
        ar: 'متوسطة',
        en: 'Medium',
        cls: 'bg-blue-100 text-blue-800 border-blue-200',
      },
      low: {
        ar: 'منخفضة',
        en: 'Low',
        cls: 'bg-slate-100 text-slate-700 border-slate-200',
      },
    };
    const item = map[priority];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.cls}`}
      >
        {isRtl ? item.ar : item.en}
      </span>
    );
  };

  const statusBadge = (status: TaskRecord['status']) => {
    const map: Record<
      TaskRecord['status'],
      { ar: string; en: string; cls: string }
    > = {
      new: {
        ar: 'جديدة',
        en: 'New',
        cls: 'bg-slate-100 text-slate-800 border-slate-200',
      },
      in_progress: {
        ar: 'قيد التنفيذ',
        en: 'In Progress',
        cls: 'bg-blue-100 text-blue-800 border-blue-200',
      },
      under_review: {
        ar: 'بانتظار الاعتماد',
        en: 'Under Review',
        cls: 'bg-purple-100 text-purple-800 border-purple-200',
      },
      completed: {
        ar: 'مكتملة ومعتمدة',
        en: 'Completed',
        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      },
      overdue: {
        ar: 'متأخرة',
        en: 'Overdue',
        cls: 'bg-rose-100 text-rose-800 border-rose-200',
      },
      cancelled: {
        ar: 'ملغاة',
        en: 'Cancelled',
        cls: 'bg-gray-100 text-gray-600 border-gray-200',
      },
    };
    const item = map[status];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.cls}`}
      >
        {isRtl ? item.ar : item.en}
      </span>
    );
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col"
      style={{
        fontFamily: isRtl
          ? "'Cairo', 'IBM Plex Sans Arabic', sans-serif"
          : "'Inter', sans-serif",
      }}
    >
      {/* Top Executive Switcher & Live Connection Bar */}
      <div className="bg-slate-900 text-white px-4 py-2.5 text-xs border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-300">
              {isRtl
                ? 'متصل بقاعدة بيانات Supabase (ipnzxspdjvnjenwzbojf)'
                : 'Connected to Supabase (ipnzxspdjvnjenwzbojf)'}
            </span>
            <span className="hidden sm:inline text-slate-400">|</span>
            <span className="hidden sm:inline text-slate-300">
              {isRtl
                ? 'نظام نخبة لإدارة الموظفين وتتبع المهام'
                : 'Nukhba Employee & Task Management SaaS'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">
              {isRtl ? 'تبديل العرض الفوري:' : 'Instant Role Switch:'}
            </span>
            <button
              type="button"
              onClick={() => handleSwitchUser('admin-1')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                currentUser.id === 'admin-1' && !showLoginModal
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isRtl ? '👔 المدير (أحمد)' : '👔 Admin (Ahmed)'}
            </button>
            <button
              type="button"
              onClick={() => handleSwitchUser('emp-1')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                currentUser.id === 'emp-1' && !showLoginModal
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isRtl ? '👩‍💻 الموظفة (سلمى)' : '👩‍💻 Employee (Salma)'}
            </button>
            <button
              type="button"
              onClick={() => handleSwitchUser('emp-2')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                currentUser.id === 'emp-2' && !showLoginModal
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isRtl ? '👨‍💻 الموظف (عمر)' : '👨‍💻 Employee (Omar)'}
            </button>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                showLoginModal
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isRtl ? '🔐 شاشة الدخول' : '🔐 Login View'}
            </button>
            <button
              type="button"
              onClick={() => setLang(isRtl ? 'en' : 'ar')}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold border border-slate-700"
            >
              {isRtl ? 'English (LTR)' : 'العربية (RTL)'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3">
          <span className="text-emerald-400 font-bold">✓</span>
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      {/* Styled Login Screen View */}
      {showLoginModal ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center font-black text-xl">
                    ن
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">
                      {isRtl
                        ? 'منصة نُخبة المؤسسية'
                        : 'Nukhba Enterprise Suite'}
                    </h1>
                    <p className="text-xs text-blue-100 mt-0.5">
                      {isRtl
                        ? 'نظام إدارة الموظفين وتتبع المهام والاعتمادات'
                        : 'Employee Management & Task Tracking System'}
                    </p>
                  </div>
                </div>
                <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-semibold">
                  v2.4 Pro
                </span>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isRtl
                    ? 'البريد الإلكتروني المؤسسي'
                    : 'Corporate Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLoginEmail(e.target.value)
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="name@nukhba.sa"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isRtl ? 'كلمة المرور' : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLoginPassword(e.target.value)
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition text-sm"
                >
                  {isRtl
                    ? 'تسجيل الدخول إلى المنصة'
                    : 'Sign In to Workspace'}
                </button>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSwitchUser('admin-1')}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition"
                  >
                    {isRtl
                      ? '⚡ دخول سريع: لوحة المدير'
                      : '⚡ Quick Demo: Admin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchUser('emp-1')}
                    className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-xl text-xs transition"
                  >
                    {isRtl
                      ? '⚡ دخول سريع: بوابة الموظف'
                      : '⚡ Quick Demo: Employee'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* Main SaaS Header */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black text-lg shadow-sm">
                  ن
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-extrabold text-slate-900">
                      {isRtl ? 'منصة نُخبة' : 'Nukhba Workspace'}
                    </h1>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        isAdmin
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isAdmin
                        ? isRtl
                          ? 'لوحة الإدارة التنفيذية'
                          : 'Admin Portal'
                        : isRtl
                        ? 'بوابة الموظف'
                        : 'Employee Portal'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {isRtl ? currentUser.full_name_ar : currentUser.full_name_en}{' '}
                    —{' '}
                    {isRtl ? currentUser.job_title_ar : currentUser.job_title_en}
                  </p>
                </div>
              </div>

              {/* Navigation Tabs + Notifications */}
              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin ? (
                  <>
                    {[
                      {
                        id: 'overview',
                        ar: '📊 نظرة عامة والـ KPIs',
                        en: '📊 Overview & KPIs',
                      },
                      {
                        id: 'employees',
                        ar: `👥 الموظفون (${kpiStats.totalEmployees})`,
                        en: `👥 Employees (${kpiStats.totalEmployees})`,
                      },
                      {
                        id: 'tasks',
                        ar: `📋 المهام (${kpiStats.totalTasks})`,
                        en: `📋 Tasks (${kpiStats.totalTasks})`,
                      },
                      {
                        id: 'reviews',
                        ar: `✅ الاعتمادات (${kpiStats.pendingReviewsCount})`,
                        en: `✅ Reviews (${kpiStats.pendingReviewsCount})`,
                      },
                      {
                        id: 'leaderboard',
                        ar: '🏆 المتصدرون والتقارير',
                        en: '🏆 Leaderboard & CSV',
                      },
                      {
                        id: 'audit',
                        ar: '🛡️ السجل الرقابي',
                        en: '🛡️ Audit Log',
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                          activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isRtl ? tab.ar : tab.en}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      {
                        id: 'my-tasks',
                        ar: `📋 مهامي المسندة (${employeeMyTasks.length})`,
                        en: `📋 My Tasks (${employeeMyTasks.length})`,
                      },
                      {
                        id: 'my-history',
                        ar: '⏱️ سجل تحديثاتي والاعتمادات',
                        en: '⏱️ Progress & Submissions',
                      },
                      {
                        id: 'leaderboard',
                        ar: '🏆 ترتيبي في المتصدرين',
                        en: '🏆 Leaderboard',
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                          activeTab === tab.id
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isRtl ? tab.ar : tab.en}
                      </button>
                    ))}
                  </>
                )}

                {/* Notification Bell */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                    className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title={isRtl ? 'الإشعارات' : 'Notifications'}
                  >
                    🔔
                    {myUnreadNotifications.length > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {myUnreadNotifications.length}
                      </span>
                    )}
                  </button>

                  {showNotifDropdown && (
                    <div
                      className={`absolute mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-40 p-3 ${
                        isRtl ? 'left-0' : 'right-0'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-800">
                          {isRtl ? 'مركز الإشعارات' : 'Notification Center'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setNotifications((prev: NotificationRecord[]) =>
                              prev.map((n: NotificationRecord) =>
                                n.recipient_id === currentUser.id
                                  ? { ...n, is_read: true }
                                  : n
                              )
                            )
                          }
                          className="text-[11px] text-blue-600 hover:underline"
                        >
                          {isRtl ? 'تحديد الكل كمقروء' : 'Mark all read'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {notifications
                          .filter(
                            (n: NotificationRecord) =>
                              n.recipient_id === currentUser.id
                          )
                          .map((n: NotificationRecord) => (
                            <div
                              key={n.id}
                              className={`p-2.5 rounded-xl text-xs border ${
                                n.is_read
                                  ? 'bg-slate-50 border-slate-100 text-slate-600'
                                  : 'bg-blue-50/70 border-blue-200 text-slate-900'
                              }`}
                            >
                              <div className="font-bold">
                                {isRtl ? n.title_ar : n.title_en}
                              </div>
                              <div className="text-slate-600 mt-0.5">
                                {isRtl ? n.body_ar : n.body_en}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1">
                                {n.created_at}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Main Workspace Body */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* ADMIN VIEW: OVERVIEW & KPI CARDS */}
            {isAdmin && activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 rounded-2xl shadow-lg">
                  <div>
                    <h2 className="text-xl font-extrabold">
                      {isRtl
                        ? 'لوحة القيادة التنفيذية ومؤشرات الأداء الفورية'
                        : 'Executive Operations & Real-Time KPI Dashboard'}
                    </h2>
                    <p className="text-xs text-blue-200 mt-1">
                      {isRtl
                        ? 'متابعة حية لنسب إنجاز المهام، طلبات الاعتماد، وتوزيع ضغط العمل بين الفرق.'
                        : 'Live tracking of task progress percentages, completion approvals, and team workload.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowAddTaskModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs shadow transition"
                    >
                      {isRtl ? '+ إسناد مهمة جديدة' : '+ Assign New Task'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddEmpModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
                    >
                      {isRtl ? '+ إضافة موظف' : '+ Add Employee'}
                    </button>
                  </div>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500">
                      {isRtl ? 'إجمالي الموظفين' : 'Total Employees'}
                    </div>
                    <div className="text-3xl font-black text-slate-900 mt-2">
                      {kpiStats.totalEmployees}
                    </div>
                    <div className="text-xs text-emerald-600 font-semibold mt-1">
                      {isRtl
                        ? `${kpiStats.activeEmps} نشط • ${kpiStats.suspendedEmps} موقوف`
                        : `${kpiStats.activeEmps} Active • ${kpiStats.suspendedEmps} Suspended`}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500">
                      {isRtl ? 'إجمالي المهام المسندة' : 'Total Assigned Tasks'}
                    </div>
                    <div className="text-3xl font-black text-blue-700 mt-2">
                      {kpiStats.totalTasks}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {isRtl
                        ? 'موزعة على الأقسام التشغيلية'
                        : 'Across all operational departments'}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500">
                      {isRtl
                        ? 'المهام المكتملة والمعتمدة'
                        : 'Completed & Approved Tasks'}
                    </div>
                    <div className="text-3xl font-black text-emerald-600 mt-2">
                      {kpiStats.completedTasks}
                    </div>
                    <div className="text-xs text-emerald-700 font-semibold mt-1">
                      {isRtl
                        ? `معدل الإنجاز الكلي: ${kpiStats.completionRate}%`
                        : `Completion Rate: ${kpiStats.completionRate}%`}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500">
                      {isRtl ? 'المهام الجارية حالياً' : 'Tasks In Progress'}
                    </div>
                    <div className="text-3xl font-black text-indigo-600 mt-2">
                      {kpiStats.inProgressTasks}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {isRtl
                        ? 'يتم تحديث نسبها لحظياً من الموظفين'
                        : 'Updated in real time by assignees'}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-sm bg-purple-50/30">
                    <div className="text-xs font-bold text-purple-800">
                      {isRtl
                        ? 'طلبات إنهاء بانتظار المراجعة'
                        : 'Pending Completion Reviews'}
                    </div>
                    <div className="text-3xl font-black text-purple-700 mt-2">
                      {kpiStats.pendingReviewsCount}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reviews')}
                      className="text-xs text-purple-700 font-bold underline mt-1"
                    >
                      {isRtl
                        ? 'مراجعة واعتماد الطلبات الآن ←'
                        : 'Review & approve requests →'}
                    </button>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm bg-rose-50/30">
                    <div className="text-xs font-bold text-rose-800">
                      {isRtl ? 'المهام المتأخرة (Overdue)' : 'Overdue Tasks'}
                    </div>
                    <div className="text-3xl font-black text-rose-600 mt-2">
                      {kpiStats.overdueTasks}
                    </div>
                    <div className="text-xs text-rose-700 mt-1">
                      {isRtl
                        ? 'تجاوزت تاريخ الاستحقاق المحدد'
                        : 'Past scheduled due date'}
                    </div>
                  </div>
                </div>

                {/* Live Task Progress Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {isRtl
                          ? 'متابعة التقدم اللحظي للمهام المشتركة والفردية'
                          : 'Live Multi-Employee Task Progress Monitor'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {isRtl
                          ? 'متوسط تقدم جميع التكليفات النشطة: '
                          : 'Average assignment progress: '}
                        <span className="font-bold text-blue-600">
                          {kpiStats.avgProgress}%
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('tasks')}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      {isRtl ? 'عرض وإدارة كل المهام ←' : 'Manage all tasks →'}
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {tasks.map((task: TaskRecord) => (
                      <div
                        key={task.id}
                        className="p-5 hover:bg-slate-50/80 transition space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {task.task_code}
                            </span>
                            <h4 className="font-bold text-sm text-slate-900">
                              {isRtl ? task.title_ar : task.title_en}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            {priorityBadge(task.priority)}
                            {statusBadge(task.status)}
                            <span className="text-xs text-slate-500">
                              📅 {task.due_date}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {task.assignments.map((asg: AssignmentRecord) => {
                            const emp = getEmployeeById(asg.employee_id);
                            return (
                              <div
                                key={asg.id}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-slate-800">
                                    👤{' '}
                                    {emp
                                      ? isRtl
                                        ? emp.full_name_ar
                                        : emp.full_name_en
                                      : asg.employee_id}
                                  </span>
                                  <span className="font-extrabold text-blue-700">
                                    {asg.progress_percentage}%
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      asg.progress_percentage === 100
                                        ? 'bg-emerald-500'
                                        : 'bg-blue-600'
                                    }`}
                                    style={{
                                      width: `${asg.progress_percentage}%`,
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span className="truncate max-w-xs">
                                    💬 {asg.last_progress_note}
                                  </span>
                                  <span>{asg.updated_at}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ADMIN VIEW: EMPLOYEES DIRECTORY */}
            {isAdmin && activeTab === 'employees' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    <input
                      type="text"
                      value={empSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEmpSearch(e.target.value)
                      }
                      placeholder={
                        isRtl
                          ? 'بحث بالاسم، الكود الوظيفي، أو البريد...'
                          : 'Search by name, code, or email...'
                      }
                      className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs w-full sm:w-72"
                    />
                    <select
                      value={empDeptFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setEmpDeptFilter(e.target.value)
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="ALL">
                        {isRtl ? 'جميع الأقسام' : 'All Departments'}
                      </option>
                      <option value="الهندسة والتطوير">
                        {isRtl ? 'الهندسة والتطوير' : 'Engineering'}
                      </option>
                      <option value="أمن المعلومات">
                        {isRtl ? 'أمن المعلومات' : 'Information Security'}
                      </option>
                      <option value="المنتجات والتصميم">
                        {isRtl ? 'المنتجات والتصميم' : 'Product & Design'}
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddEmpModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                  >
                    {isRtl ? '+ إضافة موظف جديد' : '+ Add New Employee'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredEmployees.map((emp: EmployeeRecord) => (
                    <div
                      key={emp.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                              {emp.employee_code}
                            </span>
                            <h3 className="font-extrabold text-base text-slate-900">
                              {isRtl ? emp.full_name_ar : emp.full_name_en}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {isRtl ? emp.job_title_ar : emp.job_title_en} •{' '}
                            {isRtl ? emp.department_ar : emp.department_en}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            ✉️ {emp.email} | 📱 {emp.phone}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            emp.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {emp.status === 'active'
                            ? isRtl
                              ? 'نشط'
                              : 'Active'
                            : isRtl
                            ? 'موقوف'
                            : 'Suspended'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">
                          {isRtl ? 'تاريخ التعيين:' : 'Hire Date:'}{' '}
                          {emp.hire_date}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSwitchUser(emp.id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold"
                          >
                            {isRtl
                              ? 'معاينة بوابة الموظف'
                              : 'Preview Employee View'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleEmployeeStatus(emp.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
                          >
                            {emp.status === 'active'
                              ? isRtl
                                ? 'إيقاف مؤقت'
                                : 'Suspend'
                              : isRtl
                              ? 'تفعيل'
                              : 'Activate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ADMIN VIEW: TASKS MANAGEMENT */}
            {isAdmin && activeTab === 'tasks' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={taskStatusFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setTaskStatusFilter(e.target.value)
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="ALL">
                        {isRtl ? 'جميع الحالات' : 'All Statuses'}
                      </option>
                      <option value="new">{isRtl ? 'جديدة' : 'New'}</option>
                      <option value="in_progress">
                        {isRtl ? 'قيد التنفيذ' : 'In Progress'}
                      </option>
                      <option value="under_review">
                        {isRtl ? 'بانتظار الاعتماد' : 'Under Review'}
                      </option>
                      <option value="completed">
                        {isRtl ? 'مكتملة' : 'Completed'}
                      </option>
                      <option value="overdue">
                        {isRtl ? 'متأخرة' : 'Overdue'}
                      </option>
                    </select>

                    <select
                      value={taskPriorityFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setTaskPriorityFilter(e.target.value)
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="ALL">
                        {isRtl ? 'جميع الأولويات' : 'All Priorities'}
                      </option>
                      <option value="urgent">
                        {isRtl ? 'عاجلة جداً' : 'Urgent'}
                      </option>
                      <option value="high">{isRtl ? 'عالية' : 'High'}</option>
                      <option value="medium">
                        {isRtl ? 'متوسطة' : 'Medium'}
                      </option>
                      <option value="low">{isRtl ? 'منخفضة' : 'Low'}</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                  >
                    {isRtl
                      ? '+ إنشاء وإسناد مهمة جديدة'
                      : '+ Create & Assign Task'}
                  </button>
                </div>

                <div className="space-y-4">
                  {filteredTasks.map((task: TaskRecord) => (
                    <div
                      key={task.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {task.task_code}
                            </span>
                            <h3 className="text-base font-extrabold text-slate-900">
                              {isRtl ? task.title_ar : task.title_en}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {isRtl ? task.description_ar : task.description_en}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {priorityBadge(task.priority)}
                          {statusBadge(task.status)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {task.assignments.map((asg: AssignmentRecord) => {
                          const emp = getEmployeeById(asg.employee_id);
                          return (
                            <div
                              key={asg.id}
                              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-900">
                                  👤{' '}
                                  {emp
                                    ? isRtl
                                      ? emp.full_name_ar
                                      : emp.full_name_en
                                    : asg.employee_id}
                                </span>
                                <span className="font-black text-blue-700">
                                  {asg.progress_percentage}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{
                                    width: `${asg.progress_percentage}%`,
                                  }}
                                />
                              </div>
                              <p className="text-xs text-slate-600">
                                {asg.last_progress_note}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ADMIN VIEW: COMPLETION REVIEWS */}
            {isAdmin && activeTab === 'reviews' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900">
                    {isRtl
                      ? 'طلبات اعتماد إتمام المهام المرفوعة من الموظفين'
                      : 'Employee Task Completion Review Queue'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {isRtl
                      ? 'لا تُحتسب المهمة مكتملة نهائياً إلا بعد مراجعة المخرجات واعتمادها من الإدارة.'
                      : 'Tasks are only marked Completed after management verifies deliverables and approves.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {submissions.map((sub: SubmissionRecord) => {
                    const task = getTaskById(sub.task_id);
                    const emp = getEmployeeById(sub.employee_id);
                    return (
                      <div
                        key={sub.id}
                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                              {task?.task_code || sub.task_id}
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 mt-1">
                              {task
                                ? isRtl
                                  ? task.title_ar
                                  : task.title_en
                                : sub.task_id}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {isRtl ? 'الموظف:' : 'Submitted by:'}{' '}
                              <span className="font-bold text-slate-800">
                                {emp
                                  ? isRtl
                                    ? emp.full_name_ar
                                    : emp.full_name_en
                                  : sub.employee_id}
                              </span>{' '}
                              • {sub.submitted_at}
                            </p>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              sub.review_status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : sub.review_status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {sub.review_status === 'pending'
                              ? isRtl
                                ? '⏳ بانتظار قرار الإدارة'
                                : '⏳ Pending Review'
                              : sub.review_status === 'approved'
                              ? isRtl
                                ? '✅ تم الاعتماد'
                                : '✅ Approved'
                              : isRtl
                              ? '❌ مرفوض / معاد للتعديل'
                              : '❌ Rejected'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                          <div className="font-bold text-slate-800">
                            {isRtl
                              ? 'ملخص الإنجاز المرفوع:'
                              : 'Completion Summary:'}
                          </div>
                          <p className="text-slate-700">
                            {sub.completion_comment}
                          </p>
                          {sub.deliverable_url && (
                            <div className="pt-1">
                              <span className="font-semibold text-slate-600">
                                {isRtl ? 'رابط المخرجات: ' : 'Deliverable: '}
                              </span>
                              <span className="text-blue-600 font-mono">
                                {sub.deliverable_url}
                              </span>
                            </div>
                          )}
                        </div>

                        {sub.review_status === 'pending' && (
                          <div className="pt-2 space-y-3 border-t border-slate-100">
                            <input
                              type="text"
                              value={
                                reviewingSubmissionId === sub.id
                                  ? reviewerNote
                                  : ''
                              }
                              onFocus={() => setReviewingSubmissionId(sub.id)}
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                              ) => {
                                setReviewingSubmissionId(sub.id);
                                setReviewerNote(e.target.value);
                              }}
                              placeholder={
                                isRtl
                                  ? 'أضف ملاحظات الاعتماد أو سبب الرفض (إلزامي عند الرفض)...'
                                  : 'Add review comment or rejection reason (required on reject)...'
                              }
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                            />
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleReviewDecision(sub.id, 'approved')
                                }
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                              >
                                {isRtl
                                  ? '✓ اعتماد الإنهاء النهائي'
                                  : '✓ Approve Completion'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleReviewDecision(sub.id, 'rejected')
                                }
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm"
                              >
                                {isRtl
                                  ? '✕ رفض وإعادة للموظف'
                                  : '✕ Reject & Return'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SHARED VIEW: LEADERBOARD & SAFE CSV EXPORT */}
            {activeTab === 'leaderboard' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      {isRtl
                        ? '🏆 قائمة المتصدرين وتقييم الأداء الموزون'
                        : '🏆 Weighted Performance Leaderboard'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {isRtl
                        ? 'المعادلة الموزونة: 40% المهام المعتمدة + 35% الالتزام بالوقت + 15% متوسط التقدم + 10% سرعة التسليم'
                        : 'Formula: 40% Approved Completion + 35% On-Time + 15% Avg Progress + 10% Review Speed'}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                    >
                      {isRtl
                        ? '📥 تصدير التقرير (CSV آمن)'
                        : '📥 Export Safe CSV'}
                    </button>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3.5 text-center">#</th>
                        <th className="p-3.5">
                          {isRtl ? 'الموظف' : 'Employee'}
                        </th>
                        <th className="p-3.5">
                          {isRtl ? 'القسم' : 'Department'}
                        </th>
                        <th className="p-3.5 text-center">
                          {isRtl ? 'المهام المعتمدة' : 'Approved Tasks'}
                        </th>
                        <th className="p-3.5 text-center">
                          {isRtl ? 'متوسط التقدم' : 'Avg Progress'}
                        </th>
                        <th className="p-3.5 text-center">
                          {isRtl ? 'النقاط الموزونة' : 'Weighted Score'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboardRows.map((row, index: number) => (
                        <tr key={row.emp.id} className="hover:bg-slate-50">
                          <td className="p-3.5 text-center font-black text-slate-700">
                            {index === 0
                              ? '🥇 1'
                              : index === 1
                              ? '🥈 2'
                              : index === 2
                              ? '🥉 3'
                              : index + 1}
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">
                            {isRtl
                              ? row.emp.full_name_ar
                              : row.emp.full_name_en}{' '}
                            <span className="text-slate-400 font-mono text-[11px]">
                              ({row.emp.employee_code})
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600">
                            {isRtl
                              ? row.emp.department_ar
                              : row.emp.department_en}
                          </td>
                          <td className="p-3.5 text-center font-bold text-emerald-700">
                            {row.completedApproved} / {row.totalAssigned}
                          </td>
                          <td className="p-3.5 text-center font-semibold text-blue-700">
                            {row.avgProg}%
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 font-black">
                              {row.totalScore} / 100
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMIN VIEW: IMMUTABLE AUDIT LOG */}
            {isAdmin && activeTab === 'audit' && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    {isRtl
                      ? '🛡️ السجل الرقابي غير القابل للتعديل (Immutable Activity Log)'
                      : '🛡️ Immutable Security & Activity Audit Log'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {isRtl
                      ? 'جميع العمليات موثقة زمنياً ومحمية بسياسات RLS في قاعدة البيانات.'
                      : 'All operations are timestamped and protected by append-only PostgreSQL RLS policies.'}
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {activityLogs.map((log: ActivityLogRecord) => (
                    <div
                      key={log.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {log.action_type}
                        </span>
                        <span className="font-bold text-slate-900">
                          {isRtl ? log.actor_ar : log.actor_en}:
                        </span>
                        <span className="text-slate-700">
                          {isRtl ? log.desc_ar : log.desc_en}
                        </span>
                      </div>
                      <span className="text-slate-400">{log.created_at}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EMPLOYEE PORTAL: MY ASSIGNED TASKS */}
            {!isAdmin && activeTab === 'my-tasks' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-2xl shadow-md">
                  <h2 className="text-xl font-extrabold">
                    {isRtl
                      ? `مرحباً ${currentUser.full_name_ar} — بوابة المهام الشخصية`
                      : `Welcome ${currentUser.full_name_en} — Personal Task Workspace`}
                  </h2>
                  <p className="text-xs text-emerald-100 mt-1">
                    {isRtl
                      ? 'قم بتحديث نسبة الإنجاز (0% - 100%) مع إضافة ملاحظاتك، أو ارفع طلب اعتماد إنهاء المهمة للإدارة.'
                      : 'Update your progress percentage (0% - 100%) with notes, or submit completed work for admin approval.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {employeeMyTasks.map((task: TaskRecord) => {
                    const myAsg = task.assignments.find(
                      (a: AssignmentRecord) => a.employee_id === currentUser.id
                    );
                    if (!myAsg) return null;

                    return (
                      <div
                        key={task.id}
                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {task.task_code}
                              </span>
                              <h3 className="text-base font-extrabold text-slate-900">
                                {isRtl ? task.title_ar : task.title_en}
                              </h3>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">
                              {isRtl
                                ? task.description_ar
                                : task.description_en}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {priorityBadge(task.priority)}
                            {statusBadge(task.status)}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">
                              {isRtl
                                ? 'نسبة إنجازك الحالية:'
                                : 'Your Current Progress:'}
                            </span>
                            <span className="text-sm font-black text-emerald-700">
                              {myAsg.progress_percentage}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full transition-all"
                              style={{
                                width: `${myAsg.progress_percentage}%`,
                              }}
                            />
                          </div>
                          <div className="text-xs text-slate-600 pt-1">
                            💬 {myAsg.last_progress_note}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setUpdatingTaskObj({
                                taskId: task.id,
                                currentPct: myAsg.progress_percentage,
                              });
                              setSliderPct(myAsg.progress_percentage);
                            }}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                          >
                            {isRtl
                              ? '📈 تحديث نسبة التقدم (0% - 100%)'
                              : '📈 Update Progress (0% - 100%)'}
                          </button>

                          {myAsg.individual_status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => setSubmittingTaskId(task.id)}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                            >
                              {isRtl
                                ? '✅ إرسال طلب اعتماد إنهاء المهمة'
                                : '✅ Submit Task for Completion Review'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EMPLOYEE PORTAL: MY PROGRESS HISTORY */}
            {!isAdmin && activeTab === 'my-history' && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-base font-extrabold text-slate-900">
                  {isRtl
                    ? '⏱️ سجل تحديثات التقدم الخاصة بي'
                    : '⏱️ My Progress Update History'}
                </h2>
                <div className="divide-y divide-slate-100">
                  {progressLogs
                    .filter(
                      (p: ProgressLogRecord) => p.employee_id === currentUser.id
                    )
                    .map((p: ProgressLogRecord) => (
                      <div
                        key={p.id}
                        className="py-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">
                            {p.previous_percentage}% ← {p.new_percentage}%
                          </span>
                          <p className="text-slate-600 mt-0.5">{p.note}</p>
                        </div>
                        <span className="text-slate-400">{p.created_at}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* MODAL: ADD EMPLOYEE */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEmployee}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {isRtl ? 'إضافة موظف جديد للنظام' : 'Add New Employee'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                value={newEmpNameAr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmpNameAr(e.target.value)
                }
                placeholder={
                  isRtl ? 'الاسم الكامل بالعربية' : 'Full Name (Arabic)'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <input
                type="text"
                value={newEmpNameEn}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmpNameEn(e.target.value)
                }
                placeholder={
                  isRtl ? 'الاسم بالإنجليزية' : 'Full Name (English)'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <input
                type="email"
                required
                value={newEmpEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmpEmail(e.target.value)
                }
                placeholder={
                  isRtl ? 'البريد الإلكتروني المؤسسي' : 'Corporate Email'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <input
                type="text"
                value={newEmpTitleAr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmpTitleAr(e.target.value)
                }
                placeholder={isRtl ? 'المسمى الوظيفي' : 'Job Title'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <select
                value={newEmpDeptAr}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setNewEmpDeptAr(e.target.value)
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                <option value="الهندسة والتطوير">الهندسة والتطوير</option>
                <option value="أمن المعلومات">أمن المعلومات</option>
                <option value="المنتجات والتصميم">المنتجات والتصميم</option>
              </select>
              <input
                type="text"
                value={newEmpPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmpPhone(e.target.value)
                }
                placeholder={isRtl ? 'رقم الجوال' : 'Phone Number'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddEmpModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                {isRtl ? 'حفظ وإضافة الموظف' : 'Save Employee'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD TASK */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {isRtl
                ? 'إنشاء وإسناد مهمة جديدة (فردية أو جماعية)'
                : 'Create & Assign New Task'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                value={newTaskTitleAr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewTaskTitleAr(e.target.value)
                }
                placeholder={isRtl ? 'عنوان المهمة' : 'Task Title'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <textarea
                rows={3}
                value={newTaskDescAr}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNewTaskDescAr(e.target.value)
                }
                placeholder={
                  isRtl
                    ? 'وصف المهمة والمخرجات المطلوبة...'
                    : 'Task description & required deliverables...'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTaskPriority}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setNewTaskPriority(
                      e.target.value as 'low' | 'medium' | 'high' | 'urgent'
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="urgent">
                    {isRtl ? 'عاجلة جداً' : 'Urgent'}
                  </option>
                  <option value="high">{isRtl ? 'عالية' : 'High'}</option>
                  <option value="medium">{isRtl ? 'متوسطة' : 'Medium'}</option>
                  <option value="low">{isRtl ? 'منخفضة' : 'Low'}</option>
                </select>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewTaskDueDate(e.target.value)
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {isRtl ? 'إسناد إلى الموظفين:' : 'Assign Employees:'}
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2">
                  {employees
                    .filter((e: EmployeeRecord) => e.role === 'employee')
                    .map((emp: EmployeeRecord) => {
                      const checked = newTaskAssignees.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-slate-50 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setNewTaskAssignees((prev: string[]) =>
                                checked
                                  ? prev.filter((id: string) => id !== emp.id)
                                  : [...prev, emp.id]
                              );
                            }}
                          />
                          <span>
                            {isRtl ? emp.full_name_ar : emp.full_name_en} (
                            {emp.employee_code})
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                {isRtl ? 'إنشاء وإسناد المهمة' : 'Create & Assign'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EMPLOYEE PROGRESS UPDATE (0% - 100%) */}
      {updatingTaskObj && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProgressUpdate}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {isRtl
                ? 'تحديث نسبة الإنجاز (0% - 100%)'
                : 'Update Task Progress (0% - 100%)'}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span>
                  {isRtl
                    ? `النسبة السابقة: ${updatingTaskObj.currentPct}%`
                    : `Previous: ${updatingTaskObj.currentPct}%`}
                </span>
                <span className="text-blue-600 text-base">
                  {isRtl
                    ? `النسبة الجديدة: ${sliderPct}%`
                    : `New: ${sliderPct}%`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPct}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSliderPct(Number(e.target.value))
                }
                className="w-full"
              />
              <textarea
                rows={3}
                required
                value={progressNoteText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setProgressNoteText(e.target.value)
                }
                placeholder={
                  isRtl
                    ? 'اشرح ما تم إنجازه في هذه المرحلة...'
                    : 'Describe what was accomplished in this step...'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUpdatingTaskObj(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                {isRtl ? 'حفظ التحديث' : 'Save Update'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EMPLOYEE COMPLETION SUBMISSION */}
      {submittingTaskId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleEmployeeSubmitCompletion}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {isRtl
                ? 'إرسال طلب اعتماد إنهاء المهمة للإدارة'
                : 'Submit Task Completion for Admin Review'}
            </h3>
            <div className="space-y-3">
              <textarea
                rows={3}
                required
                value={completionCommentText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setCompletionCommentText(e.target.value)
                }
                placeholder={
                  isRtl
                    ? 'اكتب ملخص الإنجاز النهائي للمراجع...'
                    : 'Write final completion summary for the reviewer...'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <input
                type="url"
                value={deliverableUrlText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDeliverableUrlText(e.target.value)
                }
                placeholder="https://..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubmittingTaskId(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                {isRtl ? 'إرسال للاعتماد' : 'Submit for Approval'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

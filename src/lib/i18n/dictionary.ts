export type Locale = 'ar' | 'en';

export const dictionary = {
  ar: {
    dir: 'rtl' as const,
    appName: 'نُخبة — نظام إدارة الموظفين وتتبع المهام',
    roles: { admin: 'مدير النظام / الإدارة', employee: 'موظف' },
    nav: {
      dashboard: 'لوحة التحكم',
      employees: 'دليل الموظفين',
      tasks: 'إدارة المهام',
      reviews: 'مراجعة الإنجاز',
      leaderboard: 'لوحة الصدارة والأداء',
      reports: 'التقارير والتصدير',
      auditLogs: 'سجل التدقيق الأمني',
      myTasks: 'مهامي المسندة',
      notifications: 'مركز الإشعارات',
      profile: 'إعدادات الحساب'
    },
    status: {
      not_started: 'لم تبدأ',
      in_progress: 'قيد التنفيذ',
      awaiting_review: 'بانتظار المراجعة',
      rejected: 'مرفوضة / تحتاج تعديل',
      approved: 'مكتملة ومعتمدة',
      canceled: 'ملغاة'
    }
  },
  en: {
    dir: 'ltr' as const,
    appName: 'Nukhba — Employee & Task Management SaaS',
    roles: { admin: 'Admin / Manager', employee: 'Employee' },
    nav: {
      dashboard: 'Dashboard',
      employees: 'Employees',
      tasks: 'Task Management',
      reviews: 'Completion Reviews',
      leaderboard: 'Leaderboard',
      reports: 'Reports & Exports',
      auditLogs: 'Activity Audit Log',
      myTasks: 'My Tasks',
      notifications: 'Notifications',
      profile: 'Profile Settings'
    },
    status: {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      awaiting_review: 'Awaiting Review',
      rejected: 'Changes Requested',
      approved: 'Completed & Approved',
      canceled: 'Canceled'
    }
  }
};

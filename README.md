# نُخبة (Nukhba) — Employee Management & Task Tracking System

Complete enterprise-grade **Employee Management and Task Tracking System** built with **Next.js (App Router)**, **TypeScript (Strict Mode)**, **Tailwind CSS**, **Zod**, and **Supabase (PostgreSQL, Auth, Row-Level Security, Realtime)**.

---

## 1. Folder Structure

```text
employee-management-system/
├── .env.example
├── next.config.mjs
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── scripts/
│   ├── lint-check.mjs
│   ├── provision-admin.mjs
│   └── type-check.mjs
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_rls_policies.sql
│       ├── 0003_functions_and_triggers.sql
│       └── 0004_seed_and_admin_provisioning.sql
├── src/
│   ├── middleware.ts
│   ├── types/
│   │   └── database.ts
│   ├── lib/
│   │   ├── i18n/dictionary.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── realtime.ts
│   │   ├── validation/schemas.ts
│   │   └── services/
│   │       ├── actions.ts
│   │       └── database-engine.mjs
│   ├── components/
│   │   └── ui/StatusBadge.tsx
│   └── app/
│       ├── globals.css
│       ├── layout.tsx
│       ├── page.tsx
│       ├── login/page.tsx
│       ├── admin/page.tsx
│       └── employee/page.tsx
└── tests/
    ├── phase1/architecture.test.mjs
    ├── phase2/database-rls.test.mjs
    ├── phase3/auth-and-routing.test.mjs
    ├── phase4/admin-features.test.mjs
    ├── phase5/employee-features.test.mjs
    ├── phase6/realtime-and-concurrency.test.mjs
    └── phase7/e2e-and-security.test.mjs
```

---

## 2. Database Schema & Migrations

Run migrations in order inside your Supabase project (`supabase db push` or via the Supabase SQL Editor):

1. `0001_initial_schema.sql`: Creates `organizations`, `profiles`, `user_roles` (isolated from ordinary profile updates), `tasks`, `task_assignments` (independent progress per employee), `task_progress_updates` (append-only), `task_submissions` (versioned), `task_reviews` (append-only), `notifications` (with unread partial index & idempotency keys), `activity_logs` (immutable), and `task_attachments`.
2. `0002_rls_policies.sql`: Enables and forces `ROW LEVEL SECURITY` on all 11 tables with `SECURITY DEFINER` non-recursive helpers (`current_user_org_id()`, `current_user_role()`, `is_org_admin()`).
3. `0003_functions_and_triggers.sql`: Creates column-security triggers (`enforce_profile_column_security`), immutability triggers (`prevent_immutable_table_mutation`), and atomic transactional RPCs (`start_task_assignment`, `record_progress_update`, `submit_task_for_review`, `review_task_submission`).
4. `0004_seed_and_admin_provisioning.sql`: Creates `provision_initial_admin` restricted strictly to `service_role`.

---

## 3. Initial Administrator Provisioning

No hardcoded passwords or public admin registration exist. To provision the first administrator:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_NAME="Tariq Al-Mansoor" \
npm run provision:admin
```

---

## 4. Testing, Linting & Type Checking

```bash
npm run lint
npm run typecheck
npm test
```

# Configuration Roadmap (Profile + Org Settings)

## Purpose
Define what users and admins should be able to configure over time, based on current Times features.  
This is a planning document only and does not imply immediate implementation.

## Current State Summary
- `app/pages/profile.vue` already has settings UI, but most values are stored in `localStorage` only.
- Password change and "sign out all sessions" are UI placeholders and not connected to backend endpoints.
- Current backend org API (`organizationsApi`) supports org name/slug and membership role updates, but no dedicated org settings resource.
- Workflow, reminders, and policy controls are partially represented in UI but not persisted server-side.

## Configuration Inventory and Plan
| Area | Setting | Scope | Current State | Placement | Phase |
|---|---|---|---|---|---|
| Personal Defaults | Default weekly hours target | User | UI exists, local only | Profile > Default settings | Phase 1 |
| Personal Defaults | Preferred week start | User | UI exists, local only | Profile > Default settings | Phase 1 |
| Personal Defaults | Default client/project | User | UI exists, local only | Profile > Default settings | Phase 1 |
| Personal Defaults | Preferred timezone | User | UI exists, local only | Profile > Default settings | Phase 1 |
| Workflow | Primary approver | User | UI exists, local only | Profile > Approvals and workflow | Phase 1 |
| Workflow | Backup approver | User | UI exists, local only | Profile > Approvals and workflow | Phase 2 |
| Workflow | Auto-reminders + day/time | User | UI exists, local only | Profile > Approvals and workflow | Phase 1 |
| Organization Policy | Organization week start day | Org | UI exists, local only | Profile > Organization preferences (admin) | Phase 1 |
| Organization Policy | Organization weekly target hours | Org | UI exists, local only | Profile > Organization preferences (admin) | Phase 1 |
| Timesheet Policy | Allow future-week capture | Org | Behavior exists in pages, not configurable | Org Settings (new section/page) | Phase 2 |
| Timesheet Policy | Working days per week | Org | Hardcoded in timesheet page | Org Settings (new section/page) | Phase 2 |
| Timesheet Policy | Required fields for row submission (notes/start/end) | Org | Partially enforced in UI | Org Settings (new section/page) | Phase 2 |
| Timesheet Policy | Daily/weekly hour limits and validation | Org | Not configurable | Org Settings (new section/page) | Phase 3 |
| Approval Policy | Reject reason required toggle | Org | Currently required by flow | Org Settings (new section/page) | Phase 2 |
| Approval Policy | Approval SLA/escalation | Org | Not configurable | Org Settings (new section/page) | Phase 3 |
| Notifications | In-app notification preferences by event | User + Org | Partially implicit | Profile + Org Settings | Phase 2 |
| Notifications | Reminder cadence policy (org default) | Org | Not configurable | Org Settings (new section/page) | Phase 2 |
| Security | Change password | User | UI placeholder | Profile > Security | Phase 1 |
| Security | Sign out all sessions | User | UI placeholder | Profile > Security | Phase 1 |
| Security | Session timeout policy | Org | Not configurable | Org Settings (new section/page) | Phase 3 |
| Security | Password policy | Org | Not configurable | Org Settings (new section/page) | Phase 3 |
| Project Governance | Restrict time logging to assigned projects | Org | Not configurable | Org Settings (new section/page) | Phase 2 |
| Project Governance | Require client on project | Org | Not configurable | Org Settings (new section/page) | Phase 3 |
| Reporting Defaults | Default report range/filter presets | User + Org | Not configurable | Reports page + Profile | Phase 3 |

## Phase Definition
- Phase 1: Persist existing Profile controls and wire placeholder security actions.
- Phase 2: Introduce org-level policy controls that affect timesheet, approvals, and notifications.
- Phase 3: Add governance/security/reporting controls that require broader backend rule enforcement.

## Suggested Backend Model Additions
- `UserPreferences` (per user, per org):
  - `weeklyHoursTarget`
  - `weekStartDay`
  - `defaultClientId`
  - `defaultProjectId`
  - `timeZone`
  - `managerMemberId`
  - `backupApproverMemberId`
  - `autoReminders`
  - `reminderDay`
  - `reminderTime`
- `OrganizationSettings` (per org):
  - `weekStartDay`
  - `weeklyHoursTarget`
  - `allowFutureWeeks`
  - `workingDaysMask`
  - `requireNotes`
  - `requireStartEndTimes`
  - `maxHoursPerDay`
  - `maxHoursPerWeek`
  - `enforceProjectAssignment`
  - `approvalRejectReasonRequired`
  - `reminderPolicy`
  - `sessionTimeoutMinutes`
  - `passwordPolicy`

## API Roadmap (High-Level)
- `GET/PATCH /v1/organizations/{orgId}/settings`
- `GET/PATCH /v1/organizations/{orgId}/users/me/preferences`
- `POST /auth/change-password`
- `POST /auth/sessions/revoke-all`

## UX Placement Guidance
- Keep personal defaults/workflow/security in Profile.
- Keep org-wide policy controls admin-only; start in Profile "Organization preferences" and move to a dedicated org settings page once controls grow.
- Do not add a sidebar entry until org settings volume justifies it; access can be from Profile for now.

## Immediate Non-Implementation Backlog (Ready to Prioritize)
- Persist all current Profile sections to backend (replace local storage).
- Wire real password change.
- Wire real revoke all sessions.
- Add org-level toggle for future-week entry.
- Add org-level toggle for assignment-only time logging.

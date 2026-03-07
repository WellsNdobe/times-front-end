# Configuration Roadmap (Profile + Org Settings)

## Purpose
Define what users and admins should be able to configure over time, based on current Times features.  
This is a planning document only and does not imply immediate implementation.

## Current State Summary
- `app/pages/profile.vue` now persists user preference defaults, workflow settings, and organization preferences through backend APIs.
- Password change and "sign out all sessions" are UI placeholders and not connected to backend endpoints.
- Current backend org API now supports dedicated organization settings for week start and weekly target hours.
- Remaining organization policy controls are not yet persisted server-side.

## Configuration Inventory and Plan
| Area | Setting | Scope | Current State | Placement | Phase |
|---|---|---|---|---|---|
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
- `OrganizationSettings` (per org):
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
- `POST /auth/change-password`
- `POST /auth/sessions/revoke-all`

## UX Placement Guidance
- Keep personal defaults/workflow/security in Profile.
- Keep org-wide policy controls admin-only; start in Profile "Organization preferences" and move to a dedicated org settings page once controls grow.
- Do not add a sidebar entry until org settings volume justifies it; access can be from Profile for now.

## Immediate Non-Implementation Backlog (Ready to Prioritize)
- Wire real password change.
- Wire real revoke all sessions.
- Add org-level toggle for future-week entry.
- Add org-level toggle for assignment-only time logging.

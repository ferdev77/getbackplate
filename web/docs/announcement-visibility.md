# Announcement Visibility Rules

This document describes how employee visibility for announcements works.

## Source of Truth

- Final access control is enforced by Postgres RLS (`can_read_announcement`).
- The employee portal (`/portal/home`) only queries active announcements and relies on RLS.

## Audience vs Scope

- `announcement_audiences` answers: _who is in the delivery audience_.
- `target_scope` answers: _which profile attributes match_.
- Both must pass for an employee to see an announcement.

## Required Audience Row

- Every announcement must include one global audience row:
  - `branch_id = null`
  - `user_id = null`
- This guarantees scoped announcements are not blocked by missing audience rows.

## Scope Fields

`target_scope` supports:

- `locations`
- `department_ids`
- `position_ids`
- `users`

If all are empty, scope is considered global.

## Position Matching

- Employee position text (`employees.position`) is mapped to active `department_positions` ids.
- RLS compares those ids against `target_scope.position_ids`.

## Implementation Notes

- Shared helpers:
  - `src/modules/announcements/lib/scope.ts`
- Creation/edit flow:
  - `src/modules/announcements/actions.ts`
- Employee read flow:
  - `src/app/(employee)/portal/home/page.tsx`

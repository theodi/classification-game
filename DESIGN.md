# Design notes (school edition admin)

Reference this when adding or changing management screens.

## Navigation

- **Top nav** is global only: Schools, Admin (platform admins), Profile, Help, Sign out. Self-paced users also get Play. Teachers and admins do not get Play in the top nav (class play is reached from a session).
- **Do not** put stacks of action buttons under the page title.
- Use **breadcrumbs** for place and movement: `Schools / Acme High / Period 1`.
- One optional **breadcrumb action** (text link on the right) is fine for a single related destination (for example “School board”). Prefer section-level actions over page-top button rows.

## Page layout

- One job per screen where possible. A **school** is one screen: details, then teachers, then sessions.
- Nest content in **grey panels** on the white page. Tables inside panels sit on a **white surface** with a light border so they read clearly.
- For list sections: show the **table first**, then a single **Add / Create button** under the table.
- Add/create flows that need fields open a **modal** (same pattern for teachers and sessions). Do not mix inline forms and header links for the same kind of action.
- Admin tables use **DataTables** with search enabled by default.
- Clickable rows open the record when that is the natural primary action (for example schools list → school).

## Copy

- Nav label **Schools** (plural), not “School” or “Leaderboards”.
- Platform account management is labelled **Admin**, not “Accounts”.

# RideConnect — Pull Request Rules

**Project:** RideConnect (AmaliTech 6-Week Internship)
**Applies to:** all pull requests into `main` (prod), `testing`, and `develop` (dev)
**Status:** draft for reviewer kick-off · **Revisit at:** end of Week 3 retro

> Items marked **[PRD]** are mandated by the RideConnect PRD.

---

## 1. Scope & size

- **One user story (US1–US7) or task (T1–T10) per PR.** No bundling unrelated changes.
- **One task per commit**, as much as can be managed. Keep commits atomic and self-describing.
- Aim for **under ~500 lines of code changed.** Split anything larger.
- **Draft PRs encouraged** for early feedback, before the work is review-ready.

## 2. Branching & commits

- **Branch naming:** `feat/<us-id>-short-desc`
- **Commit messages** follow Conventional Commits — `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:` `[PRD — NFR: Code Quality]`
- **Mandatory branches:** `main` (prod), `testing`, and `develop` (dev) — all three exist for the life of the project and are **protected**.
- **No direct pushes** to protected branches. Merge only via PR + 1 approval + green CI.
- **Branch and commit naming conventions are enforced**, not advisory — CI rejects non-conforming names (commitlint / branch-name check).

## 3. Merge direction

Work flows in one direction only. No skipping stages, no reverse merges except hotfixes.

```
feat/<us-id>-short-desc  →  develop  →  testing  →  main
```

| Merge                 | Approvals                 | CI        | Notes                                                                      |
| --------------------- | ------------------------- | --------- | -------------------------------------------------------------------------- |
| `feat/*` → `develop`  | 1 (area reviewer)         | must pass | the normal review gate; this is where feedback happens                     |
| `develop` → `testing` | 0 — team lead promotes    | must pass | batch promotion at the end of a sprint or when a slice is feature-complete |
| `testing` → `main`    | 1 (reviewer or team lead) | must pass | release only; nothing merges here that hasn't sat in `testing`             |

- **Hotfixes:** branch `fix/<short-desc>` off `main`, PR into `main` with 1 approval, then merge `main` back down into `testing` and `develop` the same day so the branches don't diverge.
- Feature branches are **deleted after merge**; keep the branch list readable.
- Rebase or merge `develop` into your feature branch to resolve conflicts — never the other way round.

## 4. Definition of Done

A PR is **mergeable** when:

- [ ] **CI green** — tests and linter pass
- [ ] Meets the story's **acceptance criteria** `[PRD]`
- [ ] **Tests added or updated** for core logic it touches — auth, ride creation, join-requests, status transitions `[PRD — T9]`
- [ ] Public functions have **docstrings / comments** `[PRD — NFR: Code Quality]`
- [ ] **≥ 1 approving review** from the area reviewer
- [ ] **No unresolved `[blocking]` comments**
- [ ] **Auth middleware guards all mutating routes** `[PRD — FR-09, NFR: Security]`
- [ ] **No secrets committed** — env vars only; no `.env`, no plaintext credentials `[PRD — NFR: Security]`

## 5. Turnaround

- **Reviewer:** first response within **1 business day** of a PR being marked _Ready for review_.
- **Author:** respond to review comments within **1 business day**.
- **No PR sits more than 3 days without action.**
- PRs opened after **Fri 15:00** may roll to the next working day.

## 6. Comment severity

So authors know what is required versus optional:

| Label        | Meaning                              |
| ------------ | ------------------------------------ |
| `[blocking]` | Must fix before merge                |
| `[should]`   | Fix now, or agree a follow-up ticket |
| `[nit]`      | Optional — style or preference       |

## 7. When a PR fails the rules

Reviewer **converts the PR back to draft** rather than opening a long comment thread. This puts the work back on the author without consuming the reviewer's limited weekly budget (~1–2 hrs/week per the PRD).

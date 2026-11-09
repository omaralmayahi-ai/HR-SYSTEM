# Implementation brief — HR-SYSTEM fixes (phase A)

You are implementing fixes found by a review. The review reports (Arabic) are in `docs/review/` of the repo (R1–R5) and `/home/claude/hrreview/`. Also see `/home/claude/ref/hr_system_inventory.md` (salary model inventory) and `/home/claude/req/requirements.md` (target payroll requirements; use it only for legal values and principles).

## Ground rules
- Work ONLY in your own git worktree (your current directory). Commit there on your branch; do not push. Do not touch files outside your ownership list (another worker owns them; if you truly need a change there, write it in your final report instead).
- Before finishing: `npx vitest run` must have **no new failures** in your area (fix the salary tests if they are yours), and `npm run build` must succeed. Add focused tests for every behaviour you change where practical (vitest, files next to the code as `*.test.ts|js`).
- Run `npm ci` first if `node_modules` is missing.
- Keep the UI design and content (screens, tabs, fields, Arabic texts). Fix logic, data handling and legal values. Do not redesign screens.
- No silent error swallowing in code you touch: a database error that is not a connection failure must surface (HTTP 4xx/5xx with an Arabic message, or a visible error in the UI). Use the existing `isDbConnectionFailure` helper (src/lib/referentialIntegrity.ts) to distinguish. **Keep the existing offline fallback behaviour for genuine connection failures** (owner decision pending); just stop reporting success when a non-connection DB error occurred.
- Never invent data: when an input is missing, return/display «بيانات ناقصة» / «غير معروف» instead of a default (no `grade || 1`, no `|| 250000`, no `|| today` for legal dates, no default religion/ethnicity).
- Legal values: use the law as stated in the requirements doc section 3 (ت-rows). Examples: certificate allowance PhD 100, Master 75, Higher diploma 55, Bachelor 45, Technical diploma 35, Preparatory 25, below that 15 (craft) — no "higher-degree extra" doubling; spouse/dependent allowance 50,000; child 10,000 up to the 4th child (son up to 24 if student, 18 if left school; daughter while unmarried and not employed); retirement deduction 10% of nominal salary only (once!); ordinary leave 1 day per 10 days of service (= 3 days/month), accumulation cap 180, max 120 per single leave; sick leave 30 days full + 45 days half pay per service year.
- Commit messages in English, imperative, and end every commit message with these two lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011GNRpFtbAKsmruhXfxAJkh
  Use `git -c user.name="Omar Almayahi" -c user.email="omar.almayahi@gmail.com" commit ...`.
- Final reply: a concise list of what you changed (file + one line), what tests you added, test/build status, and anything you could not do or that needs the owner's decision.

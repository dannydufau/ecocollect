# Evidence

All data in the screenshots is mock data. Screenshot names start with the issue ID. In full-page captures the fixed bottom bar can appear partway down the page; that is how the capture works, not a defect.

`lab-performance.json` holds the speed numbers.

`scripts/` holds the audit's one-off checks. They are not production tests.
- `push-repro.test.tsx` (PUSH-01): copy into `frontend/components/` and run `npx vitest run` on it. It **passes while the bug exists**.
- `*.mjs`: copy into a temporary folder `frontend/audit-tmp/`, start the signed-in test build on port 3100 (`npm run e2e:app` with `GATEWAY_URL=http://127.0.0.1:3101`), set `AUDIT_OUT` to an output folder, then run from `frontend/`. The journey scripts start their own mock on port 3101, so stop any other mock first. `sweep.mjs` takes the output folder as its argument and needs `audit-shots/` inside it. `demo.mjs` needs a `NEXT_PUBLIC_DEMO=true` build on port 3102.
- Some journeys generate or reuse `test-photo.png` (run `journeys1c.mjs` first). The first photo tests in `journeys1.mjs` and `journeys1b.mjs` used an unreadable image and were **discarded**; use `journeys1c.mjs` for FORM-02 and the hung upload.
- `dialogs2.mjs` makes "Report missed" appear by editing the mock's response.

Which script supports which finding: J1, J4–J7 `journeys1` · J2 `journeys1b` · J3 `journeys1c` · J8–J14 `journeys2`, `journeys2b` · J15–J21 `journeys3`, `journeys3b` · double click `journeys3c`, `journeys3d` · A1–A7 `a11y` · R1–R3 `register` · dialog axe scans `dialogs` (its final Report missed block fails, see above; use `dialogs2` for that) · speed `perf`, `perf2`.

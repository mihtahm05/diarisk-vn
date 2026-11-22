# DiaRisk VN implementation status

## Password strength validation — 2026-11-22

- Added shared frontend password-criteria helpers and backend password validation for account registration and password changes.
- Both flows require 8–128 characters, uppercase/lowercase letters, a digit, a special character and no whitespace.
- Password criteria are implicit and are not shown as a live green checklist.
- Invalid registration and password-change submissions display one clear password error for users to adjust.
- Backend registration and `POST /api/users/me/password` return HTTP 400 with a clear field-level password error for invalid values.
- Validation: targeted source changes and backend/frontend builds are pending final execution in the workspace shell because the available Windows PowerShell runner resolves the UNC WSL project path as `C:\Windows`.

## Authentication background — 2026-11-22

- Replaced the login and registration background with the supplied medical illustration.
- Both `/login` and `/register` use `frontend/src/assets/images/auth-bg.png` with responsive `cover` positioning.
- Validation: frontend production build is to be run after the final asset update.

## Model disclaimer wording — 2026-11-22

- Updated the prediction disclaimer in individual and batch-prediction interfaces to state: "Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không phải chẩn đoán thay thế cho bác sĩ."
- Updated the ML API warning response to use the same disclaimer wording.
- Validation: frontend production build and ML syntax check will be run after the wording update.

## Uploaded banner artwork

- Replaced the existing prediction banner and authentication/loading background artwork with the supplied medical consultation image.
- Updated the prediction banner rendering to cover the responsive banner frame while preserving its center composition.
- Validation: asset replacement and responsive banner CSS updated. Frontend validation could not run because dependency restoration was blocked by `ENOTEMPTY` while removing `frontend/node_modules/.bin` on the UNC/Windows setup.

## Risk classification audit — 2026-11-22

- The runtime calibration bug was found and fixed: it previously passed raw model probability directly to a calibrator trained on `logit(raw_probability)`. It now applies the logit transform before calibration.
- The bundle calibrator classes are `[0, 1]`; runtime now obtains the raw class-1 probability with `XGBClassifier.predict_proba(...)[:, 1]`, then transforms it through logit for the LogisticRegression calibrator.
- No undersampling, oversampling or SMOTE was found in the checked-in bundle or source. XGBoost `scale_pos_weight` is unset. The original cleaned data has 391,716 rows: 339,272 class 0 and 52,444 class 1 (86.6117% / 13.3883%).
- The manifest keeps all splits near the natural prevalence: train 13.3882%, calibration 13.3871%, validation 13.3897%, test 13.3871%. There are no separate 50/50 training files in the checked-in repository.
- Encoding matches the CSV/bundle: sex is `Male=0`, `Female=1`; age uses 18–24=1, 25–29=2, …, 75–79=12, 80+=13; BMI is numeric; education 1–6 and income 1–8 are direct ordinal values; smoker status is one-hot encoded as `never/former/current`.
- The checked-in independent evaluation reports 13.3982% positive prevalence on the 37,632-row common test, Brier 0.0949859221 for non-clinical and 0.0903759755 for clinical. It reports non-clinical TN/FP/FN/TP of 22349/10241/960/4082 and clinical 23694/8896/951/4091 at the 12.6586% / 13.3520% binary thresholds.
- A corrected-logit recalculation over the 39,172-row manifest test yielded positive prevalence 13.3871%; non-clinical TN/FP/FN/TP was 10320/23608/95/5149 with Brier 0.1771794472, and clinical was 12670/21258/98/5146 with Brier 0.1662792518. These results use the available manifest rather than claiming exact reproduction of the report's separate feature-selection cohorts.
- Re-running the original 32 healthy/age/BMI/sex profiles after the calibration fix produced 0.8985%–64.4589%; profiles at age 18–50 with BMI 18.5–30 and no smoking can now appear Low or Medium, while high age/BMI profiles remain High.

- Three display/API levels are now defined by fixed probability bands: Low below `10%`, Medium from `10%` to below `20%`, and High at `20%` or above.
- These bands do not replace the model bundle threshold. `threshold` remains the binary calibrated-model threshold for `positive`/`negative`, while `riskLevel` is the three-level display classification.

- The checked-in non-clinical and clinical bundles are binary diabetes-risk models. Their calibrated probability is for class `1` (high-risk / diagnosed diabetes); the calibrator class lists are `[0, 1]`.
- The binary model thresholds come from `threshold` in each bundle/schema: non-clinical `0.12658616859478225` and clinical `0.1335200957660101`.
- A representative 49.9942% profile is now `High` under the 10%/20% display bands. It is also above the binary non-clinical threshold of `12.6586%`.
- Optional values represented as `""` are omitted by FastAPI and sent to the model as `NaN`; they are not converted to `0` or `No`. The frontend and backend both enforce existing missing-value limits.
- Risk types and history filters now support `low`, `medium` and `high`.
- The ML API returns `threshold`, `classification` and `risk_thresholds`; the backend persists and serializes these fields while preserving probability, risk level, SHAP factors and encrypted input history.
- Validation: `python -m py_compile ml-service/app.py` passed. Backend `tsc` and frontend `tsc --noEmit` passed. The Vite production build remains blocked by the missing `@rollup/rollup-win32-x64-msvc` optional package in the existing frontend installation.

## Patient prediction form visual refinement

- Refined the patient prediction page with scoped card, field, text, tab and choice-control styling while preserving the existing form values and interactions.
- Improved contrast for editable, read-only and disabled fields; the automatically calculated age remains legible. Gender selections and the “Bỏ qua” choice have distinct visual treatments.
- Adjusted the basic patient metrics to use the available width consistently and stacked prediction tabs on narrow screens.
- Validation: `git diff --check` passed with CRLF-aware whitespace handling. The frontend build could not run because `typescript` is absent from `frontend/node_modules`; `npm ci` was attempted but stopped with `ENOTEMPTY` while removing `frontend/node_modules/.bin`.

## Admin account deletion

- Added per-account deletion to the admin account-management table with a confirmation dialog.
- `DELETE /api/admin/accounts/:id` soft-deletes and anonymizes the account, removes its healthcare-staff profile, revokes active sessions, and records an activity-log entry. Unique contact fields are released for future registration; existing prediction history and audit logs are retained.
- Backend authorization requires the admin role; self-deletion and deletion of the last active administrator are rejected.
- Validation: backend TypeScript build and frontend TypeScript check passed. The Vite production build could not run because the Windows Rollup optional package is missing from the installed dependencies.

## Healthcare staff profile editing

- The personal profile form now displays and allows editing the healthcare staff code and workplace.
- The profile API validates staff code updates, rejects codes already assigned to another staff member, and repairs a missing staff profile when both fields are supplied.
- Validation: backend TypeScript build, frontend TypeScript check, and `git diff --check` passed.

## Password field placeholders

- Added `********` as a visual placeholder for the current, new, and confirmation password fields. Inputs remain empty by default.
- Validation: frontend TypeScript check and `git diff --check` passed.

## Prediction form demographics and illustration

- Replaced manual age entry with age derived from date of birth and sent that integer to the existing model feature `age`.
- Removed the duplicate patient gender input; the one selected/saved gender supplies the model's `sex` feature. Existing patient selection also loads saved birthdate and gender.
- Patient code remains empty by default and shows a muted example placeholder.
- Added the supplied medical consultation image as a responsive banner and moved the model-use disclaimer below it in blue text.
- Validation: frontend `tsc --noEmit` and `git diff --check` passed. Production build remains blocked by the missing `@rollup/rollup-win32-x64-msvc` optional dependency.

## Current phase

**Phase 2 — Authentication screens (login and registration).** Work is limited to authentication UI, its existing API integration and registration validation/error handling. No dashboard or prediction workflow was changed in this phase.

## Implemented

- Responsive login and account-registration screens use the existing `/login` and `/register` routes and `authService`.
- Desktop composition places an internal CSS/inline-icon medical brand panel beside the form; mobile stacks the brand panel and form. No remote image or font URL is required.
- Registration includes user/healthcare-staff selection, shared profile fields, conditional workplace/staff code, field validation, password visibility controls, loading/duplicate-submit protection, and API error display at the relevant field.
- Login includes identifier, password visibility, remember-me storage through the existing auth service, and role-based navigation using the role returned by the backend.
- Registration endpoint validates required profile fields and reports duplicate email, phone number and staff code as field-level `409` errors. It still accepts only `user` and `doctor`; admin self-registration is not exposed.
- No password-recovery UI was added because the project has no corresponding API flow.

## Files changed in this phase

- `frontend/src/pages/auth/AuthPage.tsx` — rebuilt the authentication page and form validation.
- `frontend/src/style.css` — local, responsive auth layout and medical illustration styling; removed the external font import and repaired explicit Tailwind/PostCSS config handling for the existing palette.
- `frontend/postcss.config.js` — points Tailwind at the project config.
- `frontend/src/services/authService.ts` — documents the actual registration API response/error contract.
- `backend/src/controllers/auth.controller.ts` — required registration validation, duplicate field errors and cleanup for failed account/staff registration.
- `CLAUDE.md` — project architecture, rules and commands.
- `docs/IMPLEMENTATION_STATUS.md` — this handoff/status record.

## Verification run and evidence

- `npm --prefix frontend run build` — **passed**; includes `tsc -p tsconfig.json` and Vite production build.
- `npm --prefix backend run build` — **passed**; TypeScript compilation completed.
- Vite development page was opened and exercised in the browser at **1440×900**, **1366×768**, and **390×844**, on both `/login` and `/register`.
- Measured document width equaled the available client width at all tested sizes (no horizontal overflow). Registration grows vertically on mobile and can scroll normally.
- Browser interaction checks: healthcare-staff selection reveals workplace and staff-code fields; empty registration displays nine inline validation errors.
- Login UI and registration UI rendered. No real account creation/login was attempted because this phase did not have a configured MongoDB/auth integration test environment.

## Remaining issues / unavailable resources

- The two visual reference images mentioned in the request were not present as accessible workspace/message attachments in this session. Layout was based on the stated requirements and existing auth styling; exact pixel comparison to the references was not possible.
- No password-reset API/flow exists, so the login screen has no “forgot password” link.
- MongoDB-backed registration, duplicate races, bcrypt/JWT login, session persistence and role redirect were not integration-tested in this phase. Configure a test MongoDB and private backend environment values to verify those paths.
- There are no focused frontend/backend automated auth tests in the repository.

## Local runtime setup — 2026-10-29

- MongoDB was already installed and running locally; `mongosh` ping returned `1`.
- Created `backend/.env` because it was absent. It points to `mongodb://127.0.0.1:27017`, database `diarisk_vn`, and frontend origin `http://localhost:5173`. Private JWT and data-encryption keys were generated locally and were not printed. File permissions are `600`; do not share or commit this file.
- Started the backend with `npm --prefix backend run dev`. Startup connected to MongoDB, initialized collections/indexes, and is currently listening on port `5000`.
- `GET http://127.0.0.1:5000/api/health` returned HTTP `200` with `{"status":"ok","service":"diarisk-backend"}`.
- This confirms backend/database connectivity only; no real account registration or login has been attempted. The backend development process must remain running for authentication requests from the frontend.

## Next steps, in priority order

1. Provide the two reference images and compare/adjust spacing, proportions and illustration details against them.
2. Run registration/login against an isolated test MongoDB with test-only environment keys; verify valid registration, duplicate email/phone/staff code, invalid payloads, and role-based navigation.
3. Add focused automated auth tests for client-side field validation and server-side duplicate mapping.
4. Only after this phase is accepted, continue with another explicitly scoped project phase.

# DiaRisk VN project notes

## Architecture

- Frontend: React 18, TypeScript, Vite, Tailwind CSS in `frontend/`.
- Business API: Node.js, TypeScript, Express, MongoDB Node driver in `backend/`.
- ML API: Python, FastAPI, Pydantic, pandas, scikit-learn and XGBoost in `ml-service/`.
- MongoDB is the application database. Do not introduce a relational database or SQLAlchemy.
- Authentication uses backend-issued JWTs, bcrypt password hashes, and MongoDB sessions. Backend role checks are authoritative; never trust a role from a request body or local UI state.
- The two trained model bundles and their JSON schemas live in `ml-service/model/`. Keep these artifacts and their schema mappings intact; never claim retraining or validation that was not performed.

## Project rules

- Read relevant implementation and `docs/IMPLEMENTATION_STATUS.md` before changing behavior.
- Reuse existing pages, API clients, Tailwind and dependencies; avoid duplicate components and unrelated rewrites.
- Use environment variables for database URLs, keys and credentials. Do not commit `.env` files, secrets, patient data or credentials.
- Keep PII and prediction inputs protected according to the existing backend encryption patterns.
- Do not describe model outputs as a diagnosis or claim clinical validation. Keep evaluation statements tied to the checked-in evaluation report and its dataset scope.
- Report only builds, tests and runtime checks that were actually run. Update `docs/IMPLEMENTATION_STATUS.md` at the end of each implementation phase.

## Run locally

Prerequisites: Node.js 18+, Python 3.12 recommended for the pinned model libraries, the required model artifacts, and an available MongoDB instance.

1. Copy `backend/.env.example` to `backend/.env` and set private `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, and the MongoDB settings. Do not share or commit those values. A local `backend/.env` may already be configured; preserve it rather than replacing it.
2. Install Node dependencies from the root and service folders with `npm ci`.
3. Create and activate `ml-service/.venv`, then install `ml-service/requirements.txt`.
4. Start MongoDB, then run each service:

   - Frontend: `npm --prefix frontend run dev`
   - Backend: `npm --prefix backend run dev`
   - ML service from the project root: `ml-service/.venv/bin/python -m uvicorn app:app --app-dir ml-service --host 127.0.0.1 --port 8000` (use the platform's virtual-environment Python path on Windows).

5. Open `http://localhost:5173`. Backend and ML health endpoints are `/api/health` and `/health` respectively.

The backend expects MongoDB at `MONGODB_URI` and creates its application collections and indexes on startup. Keep the MongoDB service running before starting the backend.

## Validation commands

- Frontend TypeScript and production build: `npm --prefix frontend run build`
- Backend TypeScript build: `npm --prefix backend run build`
- ML syntax: `python -m py_compile ml-service/app.py`

See `README.md` for setup details and `docs/MONGODB_SCHEMA.md` for collections.

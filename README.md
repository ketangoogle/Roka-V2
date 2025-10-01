# ROKA Voice Idea Agent

End-to-end voice assistant for collecting and curating hotel improvement ideas, with user-scoped sessions, file uploads to GCS, and idea approval workflow.

## Overview
- Backend: Quart (async Flask-like) + SQLAlchemy (async) + Cloud SQL Connector + GCS
- Frontend: Vite + React + LiveKit components
- Realtime Agent: LiveKit + Gemini Live

## Prerequisites
- Python 3.11+
- Node 18+
- Google Cloud project with:
  - Cloud SQL (PostgreSQL)
  - Service account with Cloud SQL + Storage permissions
  - GCS bucket for uploads

## Environment Variables (Backend)
Create `ROka/backend/.env` with:
```
CLOUD_SQL_CONNECTION_NAME=project:region:instance
DB_USER=postgres
DB_PASS=your_password
DB_NAME=your_db
BUCKET_NAME=your_bucket
SIGNER_SERVICE_ACCOUNT_EMAIL=svc-account@project.iam.gserviceaccount.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

### Google Cloud credentials (service account key)
You must run the backend with a service account JSON that can sign V4 URLs and access Cloud SQL/Storage.

1) Place your key file
```
mkdir -p ROka/backend/.secrets
# copy your downloaded key into this folder, e.g.
# ROka/backend/.secrets/mvsargotaj-secret.json
```

2) Export env vars before starting the backend (choose one):
- If you start the server from ROka/backend (relative path):
```
export GOOGLE_APPLICATION_CREDENTIALS=.secrets/mvsargotaj-secret.json
export SIGNER_SERVICE_ACCOUNT_EMAIL=$(jq -r '.client_email' .secrets/mvsargotaj-secret.json)
export BUCKET_NAME=your-bucket-name
```
- Or absolute path (recommended):
```
export GOOGLE_APPLICATION_CREDENTIALS=/home/ketanraaz/web/Google_Adk/ROka/backend/.secrets/mvsargotaj-secret.json
export SIGNER_SERVICE_ACCOUNT_EMAIL=$(jq -r '.client_email' /home/ketanraaz/web/Google_Adk/ROka/backend/.secrets/mvsargotaj-secret.json)
export BUCKET_NAME=your-bucket-name
```

If you don’t have `jq`, open the JSON and copy `client_email` into `SIGNER_SERVICE_ACCOUNT_EMAIL`.

3) Verify and test
```
echo "$GOOGLE_APPLICATION_CREDENTIALS"
echo "$SIGNER_SERVICE_ACCOUNT_EMAIL"
echo "$BUCKET_NAME"

# then (with backend running)
curl -s -X POST "http://localhost:5001/generate-upload-url" \
  -H "Content-Type: application/json" \
  -d '{"file_name":"test.png","content_type":"image/png","session_id":"YOUR_SESSION_ID"}'
```
If configured correctly, the response includes `upload_url` and `download_url`.

## Install & Run
Backend
```
cd ROka/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# One-time: create tables
python3 init_db.py

# Run server (default http://localhost:5001)
python3 server.py
```

Frontend
```
cd ROka/frontend
npm install

# set backend URL (e.g.) in .env
echo 'VITE_BACKEND_URL=http://localhost:5001' > .env

npm run dev
```

## Seeded Users (auto-seeded on backend start)
- id: `ketan`, username: `Ketan`, password: `ketan123`
- id: `sharadha`, username: `Sharadha`, password: `sharadha123`

Frontend login expects the correct password before creating/joining a session. Sessions are stored with `created_by` and filtered per user.

## Data Model (key tables)
- `users(id, username, password, created_at)`
- `sessions(id, name, created_by, created_at)`
- `messages(id, session_id, role, text_content, file_url, timestamp)`
- `curated_ideas(id, session_id, created_by, idea_title, explanation, category, expected_impact, estimated_cost, urgency, status, submitted_at, approved, reviewer_notes, reviewed_at)`

## File Uploads
- Client requests a signed URL, uploads file directly to GCS, then calls `confirm-upload` to persist message in DB
- When an idea is submitted, backend mirrors any local `uploads/<session_id>/` files to
  `gs://$BUCKET_NAME/uploads/<session_id>/<safe_idea_title>/...`

## Key API Endpoints (with curl)
Base URL: `http://localhost:5001`

Health
```
curl -s "$BASE/health"
curl -s "$BASE/health/db"
```

Sessions
```
# List sessions for a user
curl -s "$BASE/sessions?user_id=ketan"

# Create session for a user
curl -s -X POST "$BASE/session" -H 'Content-Type: application/json' \
  -d '{"user_id":"ketan"}'

# Session details
curl -s "$BASE/session/details/YOUR_SESSION_ID"

# Session message history
curl -s "$BASE/session/YOUR_SESSION_ID"
```

LiveKit Token
```
curl -s "$BASE/getToken?session_id=YOUR_SESSION_ID&name=Ketan"
```

Uploads
```
# 1) Generate signed URL
curl -s -X POST "$BASE/generate-upload-url" -H 'Content-Type: application/json' \
  -d '{"file_name":"note.png","content_type":"image/png","session_id":"YOUR_SESSION_ID"}'

# 2) Upload file (use upload_url from the previous response)
UPLOAD_URL="PASTE_UPLOAD_URL" 
curl -i -X PUT "$UPLOAD_URL" -H 'Content-Type: image/png' --data-binary @/path/to/note.png

# 3) Confirm upload
curl -s -X POST "$BASE/confirm-upload" -H 'Content-Type: application/json' \
  -d '{"blob_name":"uploads/YOUR_SESSION_ID/UUID-note.png","session_id":"YOUR_SESSION_ID","original_filename":"note.png"}'
```

Curated Ideas
```
# Submit idea (after user confirms the form in UI)
curl -s -X POST "$BASE/submit-idea" -H 'Content-Type: application/json' \
  -d '{
        "session_id":"YOUR_SESSION_ID",
        "created_by":"ketan",
        "idea_title":"Replace towels",
        "explanation":"Better guest satisfaction and hygiene",
        "category":"housekeeping",
        "expected_impact":"Improved hygiene",
        "estimated_cost":"$300",
        "urgency":"medium"
      }'

# Ideas for a session
curl -s "$BASE/ideas/YOUR_SESSION_ID"

# Approve / reject idea (use id from the previous response)
curl -s -X POST "$BASE/submit-idea" -H 'Content-Type: application/json' \
  -d '{"idea_id":101,"approved":true,"reviewer_notes":"Looks good"}'

# All ideas
curl -s "$BASE/ideas"
```

## Agent Prompt (Bilingual)
- Respond in the user’s language (Hindi/English)
- Ask targeted follow-ups: impact, scope, cost, urgency, dependencies/branch/team, risks, ownership
- Show a summary form for confirmation; frontend submits to save

## Troubleshooting
- If you see errors about missing columns, restart backend once so startup migrations run, or use inline ALTERs already added in handlers
- Verify DB health: `curl -s "$BASE/health/db"`

Terminal 1: Run the Backend

cd roka/backend

source .venv/bin/activate

python server.py
This server will run on http://127.0.0.1:5001.

Terminal 2: Run the LiveKit Agent

cd roka/backend

source .venv/bin/activate

Run the agent worker:

python agent.py dev
This will connect your agent to the LiveKit server, ready to join a room.

Terminal 3: Run the Frontend

cd roka/frontend

npm install

npm install @phosphor-icons/react

Start the frontend development server:
npm run dev

Open your browser and go to the URL provided by Vite (usually http://localhost:5173).



# Roka-V2
# Roka-V2

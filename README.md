Of course. Here is the updated `README.md` file with every `curl` command written out in full detail, without using the `$AUTH` and `$BASE_URL` shorthand variables.

This makes each example fully self-contained and easy to copy and paste for testing.

-----

# ROKA Agent - Backend API Documentation 🚀

This document provides all the necessary information for the frontend team to connect to and interact with the ROKA Voice Idea Agent backend. The backend is live and hosted on Google Cloud Run.

## Base URL

All API endpoints are relative to the following base URL:

  * **Live URL:** `https://roka-agent-backend-684535434104.us-central1.run.app`

-----

## Authentication

The API uses a two-part authentication system.

### 1\. User Login

To begin, the user must log in through the frontend. The frontend will send a `POST` request to the public `/login` endpoint.

  * **Username**: `admin`
  * **Password**: `password@123`

If the credentials are correct, the backend will return a success message. The frontend should then grant the user access to the main application.

### 2\. API Request Authentication

After the user is logged in, **every subsequent API call** to a protected endpoint must be authenticated using **HTTP Basic Auth**.

The frontend must include an `Authorization` header with every request.

  * **Header**: `Authorization: Basic YWRtaW46cGFzc3dvcmRAMTIz`
      * (The value is the Base64 encoding of `admin:password@123`)

-----

## API Endpoints 🛠️

Here are the available endpoints with fully detailed `curl` commands for testing.

### Health Checks (Public)

These endpoints require no authentication. They are used to verify that the service is online.

  * **`GET /health`**
      * Checks if the web server is running.
      * **`curl` Example:**
        ```bash
        curl "https://roka-agent-backend-684535434104.us-central1.run.app/health"
        ```
  * **`GET /health/db`**
      * Checks if the database connection is healthy.
      * **`curl` Example:**
        ```bash
        curl "https://roka-agent-backend-684535434104.us-central1.run.app/health/db"
        ```

### Login (Public)

  * **`POST /login`**
      * Authenticates the user. The frontend should call this when the user submits the login form.
      * **`curl` Example:**
        ```bash
        curl -X POST "https://roka-agent-backend-684535434104.us-central1.run.app/login" \
          -H "Content-Type: application/json" \
          -d '{"username": "admin", "password": "password@123"}'
        ```

### Sessions (Protected)

  * **`GET /sessions`**
      * Lists all sessions created by a specific user (`ketan` or `shraddha`).
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/sessions?user_id=ketan"
        ```
  * **`POST /session`**
      * Creates a new session for a user.
      * **`curl` Example:**
        ```bash
        curl -X POST -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/session" \
          -H "Content-Type: application/json" \
          -d '{"user_id": "ketan"}'
        ```
  * **`GET /session/details/:session_id`**
      * Gets metadata for a single session (like name and creation time).
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/session/details/YOUR_SESSION_ID"
        ```
  * **`GET /session/:session_id`**
      * Gets the full message history for a single session.
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/session/YOUR_SESSION_ID"
        ```

### File Upload (Protected)

  * **`POST /upload-file`**
      * Uploads a file associated with a session. Must be sent as `multipart/form-data`.
      * **`curl` Example:**
        ```bash
        # Replace '/path/to/your/file.png' with a real file path and update the session ID
        curl -X POST -u "admin:password@123" \
          -F "file=@/path/to/your/file.png" \
          -F "session_id=YOUR_SESSION_ID" \
          "https://roka-agent-backend-684535434104.us-central1.run.app/upload-file"
        ```

### Curated Ideas (Protected)

  * **`POST /submit-idea`**
      * Submits a new idea or updates an existing one (e.g., for approval).
      * **`curl` Example (New Idea):**
        ```bash
        curl -X POST -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/submit-idea" \
          -H "Content-Type: application/json" \
          -d '{"session_id": "YOUR_SESSION_ID", "created_by": "ketan", "idea_title": "New Idea", "explanation": "A detailed explanation of the new idea.", "category": "Test", "urgency": "low"}'
        ```
      * **`curl` Example (Approve Idea):**
        ```bash
        curl -X POST -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/submit-idea" \
          -H "Content-Type: application/json" \
          -d '{"idea_id": 1, "approved": true, "reviewer_notes": "This is a great idea. Approved."}'
        ```
  * **`GET /ideas`**
      * Retrieves a list of all curated ideas in the system.
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/ideas"
        ```
  * **`GET /ideas/:session_id`**
      * Retrieves all ideas associated with a specific session.
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/ideas/YOUR_SESSION_ID"
        ```
  * **`POST /compare-ideas`**
      * Sends two idea objects to the Gemini API for a detailed comparison.
      * **`curl` Example:**
        ```bash
        curl -X POST -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/compare-ideas" \
        -H 'Content-Type: application/json' \
        -d '{
              "idea1": {"idea_title": "Idea A", "explanation": "Explanation A"},
              "idea2": {"idea_title": "Idea B", "explanation": "Explanation B"}
            }'
        ```

### LiveKit Token (Protected)

  * **`GET /getToken`**
      * Generates a token for a user to join a LiveKit video/audio room.
      * **`curl` Example:**
        ```bash
        curl -u "admin:password@123" "https://roka-agent-backend-684535434104.us-central1.run.app/getToken?session_id=YOUR_SESSION_ID&name=Ketan"
        ```
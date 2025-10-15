# ---------- CONFIGURATION ----------
include .env
export

PROJECT_ID=mvsargotaj
REGION=us-central1
REPO_NAME=roka-agent-backend-v2
SERVICE_ACCOUNT="684535434104-compute@developer.gserviceaccount.com"

# Services
API_SERVICE_NAME=roka-agent-backend
AGENT_SERVICE_NAME=roka-agent-backend-livekit

# Images (Artifact Registry)
API_IMAGE_NAME = $(API_SERVICE_NAME)
AGENT_IMAGE_NAME= $(AGENT_SERVICE_NAME)
IMAGE_TAG = latest

API_IMAGE_URL= $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO_NAME)/$(API_IMAGE_NAME):$(IMAGE_TAG)
AGENT_IMAGE_URL= $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO_NAME)/$(AGENT_IMAGE_NAME):$(IMAGE_TAG)
CREATE_URL=$(REPO_NAME) --repository-format=docker --location=$(REGION) --description="ROKA services repository"

# Environment variables to pass (adjust as needed)
ENV_VARS = \
	BUCKET_NAME=$(BUCKET_NAME),\
	SIGNER_SERVICE_ACCOUNT_EMAIL=$(SIGNER_SERVICE_ACCOUNT_EMAIL),\
	CLOUD_SQL_CONNECTION_NAME=$(CLOUD_SQL_CONNECTION_NAME),\
	DB_USER=$(DB_USER),DB_PASS=$(DB_PASS),DB_NAME=$(DB_NAME),\
	GEMINI_API_KEY=$(GEMINI_API_KEY),\
	GOOGLE_API_KEY=$(GOOGLE_API_KEY),\
	GOOGLE_CLOUD_PROJECT=$(GOOGLE_CLOUD_PROJECT),\
	GOOGLE_CLOUD_LOCATION=$(GOOGLE_CLOUD_LOCATION),\
	LIVEKIT_URL=$(LIVEKIT_URL),\
	LIVEKIT_API_KEY=$(LIVEKIT_API_KEY),\
	LIVEKIT_API_SECRET=$(LIVEKIT_API_SECRET)


# ---------- COMMANDS ----------

.PHONY: help create build-api build-agent build deploy-api deploy-agent logs-api logs-agent all

help:
	@echo "Usage:"
	@echo "  make create          - Create Artifact Registry"
	@echo "  make build-api       - Build API image with Cloud Build"
	@echo "  make build-agent     - Build Agent image with Cloud Build"
	@echo "  make deploy-api      - Deploy API (server.py) to Cloud Run"
	@echo "  make deploy-agent    - Deploy Agent (agent.py) to Cloud Run"
	@echo "  make logs-api        - Tail logs from API service"
	@echo "  make logs-agent      - Tail logs from Agent service"
	@echo "  make all             - Create repo, build both, deploy both"

create:
	gcloud artifacts repositories create $(CREATE_URL)

build-api:
	gcloud builds submit --tag=$(API_IMAGE_URL)

build-agent:
	gcloud builds submit --tag=$(AGENT_IMAGE_URL)

build: build-api build-agent

deploy-api:
	gcloud run deploy $(API_SERVICE_NAME) \
		--image=$(API_IMAGE_URL) \
		--platform=managed \
		--region=$(REGION) \
		--service-account=$(SERVICE_ACCOUNT) \
		--set-env-vars="$(ENV_VARS)"

deploy-agent:
	gcloud run deploy $(AGENT_SERVICE_NAME) \
		--image=$(AGENT_IMAGE_URL) \
		--platform=managed \
		--region=$(REGION) \
		--service-account=$(SERVICE_ACCOUNT) \
		--set-env-vars=$(ENV_VARS)

logs-api:
	gcloud logs tail --project=$(PROJECT_ID) \
		--resource=cloud_run_revision \
		--limit=100 \
		--format="value(textPayload)" \
		--log-filter="resource.labels.service_name=$(API_SERVICE_NAME)"

logs-agent:
	gcloud logs tail --project=$(PROJECT_ID) \
		--resource=cloud_run_revision \
		--limit=100 \
		--format="value(textPayload)" \
		--log-filter="resource.labels.service_name=$(AGENT_SERVICE_NAME)"

all: create build-api build-agent deploy-api deploy-agent
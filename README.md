# Private Knowledge Q&A – Backend

## Overview
This is the backend API for the Private Knowledge Q&A application.
It allows uploading documents, asking questions, and retrieving answers with source context.

## Tech Stack
- Node.js
- Express
- PostgreSQL (Render managed)
- Groq LLM API

## API Endpoints
- `POST /documents` – Upload a text document
- `GET /documents` – List uploaded documents
- `POST /ask` – Ask a question
- `GET /status` – Health check for backend, database, and LLM

## Environment Variables
Create a `.env` file using `.env.example`.

Required:
- `DATABASE_URL`
- `GROQ_API_KEY`
- `PORT`

## Run Locally
```bash
npm install
node index.js
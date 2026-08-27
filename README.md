# All In One Fitness AI app

This project contains a fitness app frontend and an AI backend that supports:

- local Ollama usage for private testing
- OpenAI-compatible online cloud AI for public/global use
- automatic fallback when no AI provider is available

## Local development

1. Open a terminal in the project folder.
2. Start the server:

   python server.py

3. Open the app in a browser:

   http://localhost:8000

4. The app will call the local AI endpoint at:

   http://127.0.0.1:11434/api/chat

## Public/global deployment

Set environment variables before starting the app:

- PORT
- OPENAI_API_KEY
- OPENAI_BASE_URL
- OPENAI_MODEL

Example:

```bash
export PORT=8000
export OPENAI_API_KEY=your_key_here
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
python server.py
```

When OPENAI_API_KEY is present, the backend prefers the public OpenAI-compatible provider and falls back to the local Ollama model if needed.

Before deploying publicly, set all secrets in the hosting provider's environment settings. Never upload `.env` or `.withings_tokens.json`. Set `REDIRECT_URI` to the public HTTPS callback URL, for example `https://your-domain.example/api/provider/callback`, and register exactly that URL in the Withings Developer Portal.

## API endpoints

- GET /api/health
- POST /api/coach

The local AI is shared by users who open the app through the same running server. Each browser sends its own app context with the question; the backend does not keep a shared conversation history.

To allow another device on the same Wi-Fi to use the local AI, keep `server.py` running on the computer and open the computer's LAN address, for example `http://192.168.8.109:8001`. Ollama must be running on the server computer for full AI answers; otherwise the app returns a local fallback response.

The /api/coach endpoint expects a JSON body like:

```json
{
  "question": "Hvordan kan jeg forbedre min søvn og restitution?",
  "context": {
    "profile": { "name": "Maja" }
  }
}
```

## Deployment tips

This app is ready to be deployed to platforms such as Render, Railway, Fly.io, or a VPS.

The simplest public setup is:

- host the app on a public server
- set the OpenAI API key in the environment
- keep the app behind HTTPS
- let users connect to the deployed URL

This gives every user access to the same AI backend from anywhere in the world.

### Railway

Create a Railway service from this repository. Railway can use `railway.json` and start the app with `python server.py`. Add the variables from `.env.example` in Railway's Variables panel. Set `PORT` to Railway's provided port, set `REDIRECT_URI` to the generated public HTTPS URL plus `/api/provider/callback`, and register that exact callback in the Withings Developer Portal. Add a persistent volume or database before using the service for real users, so user tokens and data survive deployments.

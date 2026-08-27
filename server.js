const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8000);
const rootDir = __dirname;
const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function fallbackAnswer(question, context = {}) {
  const q = String(question || '').trim();
  const name = context?.profile?.name || 'du';
  const goal = context?.selected?.goal || 'dit mål';
  const kcalTarget = Number(context?.calories?.target || 0);
  const calories = Number(context?.foodToday?.calories || 0);

  if (!q) return 'Skriv et spørgsmål, så jeg kan hjælpe dig.';
  if (/kcal|kalor|mad|spis|måltid|kost/i.test(q)) {
    return `${name}, du har i dag registreret ${calories} kcal. Hvis dit mål er ${kcalTarget} kcal, så er det her en god start til at justere maden.`;
  }
  if (/træne|træn|øvelse|session|program/i.test(q)) {
    return `For ${goal} vil jeg anbefale en enkel og konsekvent træningsplan: fokusér på hovedøvelser, god teknik og progression. Start med 3-5 sæt pr. øvelse og mål for fremgang hver uge.`;
  }
  if (/step|steps|gang|bevægel/i.test(q)) {
    return `Fortsæt med regelmæssig bevægelse hver dag. Lidt mere aktivitet hver dag giver bedre restitution, mere energi og bedre træningsrespons.`;
  }
  return `Jeg kan hjælpe med træning, kost, mål og generelle spørgsmål. Tilpas svaret til dine data i appen, og hvis du vil, kan du spørge mere konkret om måltider, progression eller dagens plan.`;
}

async function callLocalAi(question, context = {}, images = []) {
  const payload = {
    model: ollamaModel,
    stream: false,
    messages: [
      {
        role: 'system',
        content: 'Du er en hjælpsom dansk AI-assistent. Besvar spørgsmål på dansk. Brug kun app-data som kontekst, når de faktisk er relevante. Giv konkrete, nyttige svar om træning, kost, mål, livsstil og almindelige spørgsmål. Hvis noget mangler, sig det tydeligt.'
      },
      {
        role: 'user',
        content: JSON.stringify({ question, context })
      }
    ]
  };

  if (images && images.length) {
    payload.messages[1].images = images;
  }

  const response = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}`);
  }

  const data = await response.json();
  const answer = data?.message?.content || data?.content || '';
  if (typeof answer === 'string' && answer.trim()) {
    return answer.trim();
  }

  throw new Error('AI returned an empty response');
}

async function handleCoachRequest(req, res, body) {
  const question = String(body?.question || '').trim();
  const context = body?.context || {};
  const images = Array.isArray(body?.images) ? body.images : [];

  if (!question) {
    return sendJson(res, 400, { answer: 'Skriv et spørgsmål, så AI kan hjælpe dig.' });
  }

  try {
    const answer = await callLocalAi(question, context, images);
    return sendJson(res, 200, { answer });
  } catch (error) {
    const answer = fallbackAnswer(question, context);
    return sendJson(res, 200, { answer, fallback: true, error: String(error.message || error) });
  }
}

async function serveStaticFile(res, requestPath) {
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = path.normalize(relativePath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(rootDir, safePath.replace(/^\//, ''));

  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      const fallbackPath = path.join(filePath, 'index.html');
      const fallbackBuffer = await fs.promises.readFile(fallbackPath);
      const extension = path.extname(fallbackPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'text/html; charset=utf-8' });
      return res.end(fallbackBuffer);
    }

    const buffer = await fs.promises.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
    res.end(buffer);
  } catch (error) {
    const fallbackBuffer = await fs.promises.readFile(path.join(rootDir, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fallbackBuffer);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'fitness-ai-proxy',
      port,
      ollamaUrl,
      model: ollamaModel
    });
  }

  if (url.pathname === '/api/coach') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { answer: 'Kun POST-metoden er tilladt.' });
    }

    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        await handleCoachRequest(req, res, parsed);
      } catch (error) {
        sendJson(res, 400, { answer: 'Kunne ikke læse spørgsmål. Prøv igen.' });
      }
    });
    return;
  }

  return serveStaticFile(res, url.pathname);
});

server.listen(port, () => {
  console.log(`Fitness AI app running at http://localhost:${port}`);
  console.log(`AI endpoint: ${ollamaUrl}`);
});

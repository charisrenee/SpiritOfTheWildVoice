import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const NPS_API_KEY = process.env.NPS_API_KEY;
const PORT = process.env.PORT || 3000;

if (!ASSEMBLYAI_API_KEY) {
  console.error('Missing ASSEMBLYAI_API_KEY — copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!NPS_API_KEY) {
  console.error('Missing NPS_API_KEY — get a free key at https://www.nps.gov/subjects/developer/get-started.htm');
  process.exit(1);
}

async function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Mint a single-use AssemblyAI session token (never expose the real API key to the browser)
  if (url.pathname === '/token' && req.method === 'GET') {
    try {
      const r = await fetch(
        'https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=3600',
        { headers: { authorization: `Bearer ${ASSEMBLYAI_API_KEY}` } },
      );
      const data = await r.json();
      return json(res, data);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // Proxy NPS park info (keeps NPS key off the client)
  if (url.pathname === '/api/park' && req.method === 'GET') {
    const name = url.searchParams.get('name');
    if (!name) return json(res, { error: 'Missing ?name=' }, 400);
    try {
      const r = await fetch(
        `https://developer.nps.gov/api/v1/parks?q=${encodeURIComponent(name)}&limit=3&fields=entranceFees,operatingHours,activities,topics,images&api_key=${NPS_API_KEY}`,
      );
      const data = await r.json();
      return json(res, data);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // Proxy iNaturalist recent research-grade sightings near a lat/lng
  if (url.pathname === '/api/sightings' && req.method === 'GET') {
    const latRaw = url.searchParams.get('lat');
    const lngRaw = url.searchParams.get('lng');
    const lat = parseFloat(latRaw), lng = parseFloat(lngRaw);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(res, { error: 'Invalid lat/lng' }, 400);
    }
    try {
      const r = await fetch(
        `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=50&quality_grade=research&per_page=12&order=desc&order_by=observed_on&iconic_taxa=Mammalia,Aves,Reptilia,Amphibia,Plantae`,
      );
      const data = await r.json();
      return json(res, data);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // Serve index.html for everything else
  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    } catch {
      res.writeHead(404);
      return res.end('index.html not found');
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🌲  Spirit of the Wild — running at http://localhost:${PORT}\n`);
});

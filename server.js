import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

// Per-IP rate limiting (this server also runs as the production catch-all on Vercel)
const buckets = new Map();
function rateLimited(req, res, key, limit, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const id = `${key}:${ip}`;
  const b = buckets.get(id);
  if (!b || now > b.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return false;
  }
  if (++b.count > limit) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil((b.reset - now) / 1000) });
    res.end(JSON.stringify({ error: 'Too many requests — slow down a little.' }));
    return true;
  }
  return false;
}

function accessCodeInvalid(req) {
  if (!process.env.ACCESS_CODE) return false; // gate disabled when unset (local dev)
  let given = req.headers['x-access-code'] || '';
  try { given = decodeURIComponent(given); } catch {}
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(process.env.ACCESS_CODE).digest();
  return !crypto.timingSafeEqual(a, b);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Mint a single-use AssemblyAI session token (never expose the real API key to the browser).
  // Also answers /api/token: on Vercel the /token rewrite lands here as /api/token.
  if ((url.pathname === '/token' || url.pathname === '/api/token') && req.method === 'GET') {
    if (accessCodeInvalid(req)) return json(res, { error: 'Invalid access code' }, 401);
    if (rateLimited(req, res, 'token', 5, 10 * 60 * 1000)) return;
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
    if (rateLimited(req, res, 'park', 30, 60 * 1000)) return;
    const name = url.searchParams.get('name');
    if (!name) return json(res, { error: 'Missing ?name=' }, 400);
    try {
      const r = await fetch(
        `https://developer.nps.gov/api/v1/parks?q=${encodeURIComponent(name)}&limit=50&fields=entranceFees,operatingHours,activities,topics,images&api_key=${NPS_API_KEY}`,
      );
      const data = await r.json();
      // NPS q= is a full-text search sorted alphabetically, so the asked-for park
      // can rank behind parks that merely mention it. Put name matches first.
      if (Array.isArray(data.data)) {
        const q = name.toLowerCase();
        data.data.sort(
          (a, b) =>
            (b.fullName || '').toLowerCase().includes(q) -
            (a.fullName || '').toLowerCase().includes(q),
        );
        data.data = data.data.slice(0, 3);
      }
      return json(res, data);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // Proxy iNaturalist recent research-grade sightings near a lat/lng
  if (url.pathname === '/api/sightings' && req.method === 'GET') {
    if (rateLimited(req, res, 'sightings', 30, 60 * 1000)) return;
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

  // Proxy iNaturalist species counts (frequency-ranked species near a lat/lng)
  if (url.pathname === '/api/species' && req.method === 'GET') {
    if (rateLimited(req, res, 'species', 30, 60 * 1000)) return;
    const lat = parseFloat(url.searchParams.get('lat')), lng = parseFloat(url.searchParams.get('lng'));
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(res, { error: 'Invalid lat/lng' }, 400);
    }
    try {
      const r = await fetch(
        `https://api.inaturalist.org/v1/observations/species_counts?lat=${lat}&lng=${lng}&radius=50&quality_grade=research&per_page=40&iconic_taxa=Mammalia,Aves,Reptilia,Amphibia,Plantae,Insecta,Fungi`,
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

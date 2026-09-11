import { rateLimit } from './_guard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req, res, { key: 'park', limit: 30, windowMs: 60 * 1000 })) return;

  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Missing ?name=' });

  try {
    const r = await fetch(
      `https://developer.nps.gov/api/v1/parks?q=${encodeURIComponent(name)}&limit=50&fields=entranceFees,operatingHours,activities,topics,images&api_key=${process.env.NPS_API_KEY}`,
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
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import { rateLimit } from './_guard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req, res, { key: 'sightings', limit: 30, windowMs: 60 * 1000 })) return;

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid lat/lng' });
  }

  try {
    const r = await fetch(
      `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=50&quality_grade=research&per_page=12&order=desc&order_by=observed_on&iconic_taxa=Mammalia,Aves,Reptilia,Amphibia,Plantae`,
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

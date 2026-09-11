import { rateLimit, checkAccessCode } from './_guard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Tokens spend AssemblyAI credits: require the shared access code,
  // and allow at most 5 new sessions per IP per 10 minutes.
  if (!checkAccessCode(req, res)) return;
  if (!rateLimit(req, res, { key: 'token', limit: 5, windowMs: 10 * 60 * 1000 })) return;

  try {
    const r = await fetch(
      'https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=900',
      { headers: { authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` } },
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

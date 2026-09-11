import crypto from 'crypto';

// Best-effort in-memory rate limiter. Each warm serverless instance keeps its
// own counts, so real limits can be a small multiple of these numbers — good
// enough to stop casual abuse without adding a Redis dependency.
const buckets = new Map();

export function rateLimit(req, res, { limit, windowMs, key = 'rl' }) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const id = `${key}:${ip}`;
  const b = buckets.get(id);

  if (!b || now > b.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count++;
  if (b.count > limit) {
    res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
    res.status(429).json({ error: 'Too many requests — slow down a little.' });
    return false;
  }
  return true;
}

export function checkAccessCode(req, res) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) {
    res.status(500).json({ error: 'ACCESS_CODE is not configured on the server' });
    return false;
  }
  const given = req.headers['x-access-code'] || '';
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid access code' });
    return false;
  }
  return true;
}

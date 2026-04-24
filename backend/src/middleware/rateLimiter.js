/**
 * Rate Limiting Middleware
 *
 * Simple sliding-window rate limiter using in-memory maps.
 * No external dependency required — keeps the stack lightweight.
 */

const hits = new Map(); // key -> [{ ts }]

function createLimiter({ windowMs = 60000, max = 60, keyPrefix = 'gen' } = {}) {
  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const tenantId = req.tenant?.id || 'anon';
    const key = `${keyPrefix}:${tenantId}:${ip}`;
    const now = Date.now();

    // Get or create hit list
    let list = hits.get(key);
    if (!list) {
      list = [];
      hits.set(key, list);
    }

    // Prune expired entries
    const cutoff = now - windowMs;
    while (list.length && list[0] < cutoff) list.shift();

    if (list.length >= max) {
      const retryAfter = Math.ceil((list[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        error: 'Too many requests',
        retry_after_seconds: retryAfter,
      });
    }

    list.push(now);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(max - list.length));

    next();
  };
}

// Pre-built tiers
const generalLimiter  = createLimiter({ windowMs: 60000, max: 60, keyPrefix: 'gen' });
const messagingLimiter = createLimiter({ windowMs: 60000, max: 30, keyPrefix: 'msg' });
const bulkLimiter      = createLimiter({ windowMs: 60000, max: 10, keyPrefix: 'bulk' });

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of hits.entries()) {
    // Remove entries older than 2 minutes (covers all windows)
    const cutoff = now - 120000;
    while (list.length && list[0] < cutoff) list.shift();
    if (list.length === 0) hits.delete(key);
  }
}, 300000);

module.exports = { createLimiter, generalLimiter, messagingLimiter, bulkLimiter };

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'wa-crm-secret';

function generateToken(tenant) {
  return jwt.sign(
    { id: tenant.id, email: tenant.email, name: tenant.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.tenant = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.tenant = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}

module.exports = { generateToken, authMiddleware, authenticateSocket };

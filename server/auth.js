import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'very-secret-key-change-me';
const TOKEN_EXPIRY = '7d';

export function makeJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Nije autorizirano' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesija je istekla. Prijavite se ponovno.' });
  }
}

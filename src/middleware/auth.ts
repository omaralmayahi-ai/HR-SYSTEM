// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'hr-system-iraq-secure-jwt-secret-key-2026';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    name: string;
    email: string;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    // 1. Verify with JWT
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded && decoded.username) {
      req.user = decoded;
      return next();
    }
  } catch (jwtErr) {
    // 2. Backward compatibility fallback for legacy base64 tokens during transition
    try {
      const jsonStr = Buffer.from(token, 'base64').toString('utf8');
      const userData = JSON.parse(jsonStr);
      if (userData && userData.username) {
        req.user = userData;
        return next();
      }
    } catch {
      // ignore
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
};


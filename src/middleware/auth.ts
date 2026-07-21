// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

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
    const jsonStr = Buffer.from(token, 'base64').toString('utf8');
    const userData = JSON.parse(jsonStr);
    if (!userData || !userData.username) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token structure' });
    }
    req.user = userData;
    next();
  } catch (error) {
    console.error('Error verifying custom token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

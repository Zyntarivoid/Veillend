import { Request, Response, NextFunction } from 'express';

export function createOriginCheckMiddleware(allowlist: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers['origin'];
    if (origin && !allowlist.includes(origin)) {
      res.status(403).json({ message: 'Forbidden: Origin not allowed' });
      return;
    }
    next();
  };
}

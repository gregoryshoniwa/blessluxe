import type { Request, Response, NextFunction } from "express";

export function optionalApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const key = req.headers["x-publishable-api-key"] as string | undefined;
  const expected = (process.env.PUBLISHABLE_API_KEY || "").trim();
  if (expected && key && key !== expected) {
    _res.status(401).json({ type: "unauthorized", message: "Invalid API key" });
    return;
  }
  next();
}

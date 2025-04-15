import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "./catchAsyncError";
import ErrorHandeler from "../utils/ErrorHandler";
import jwt, { JwtPayload } from "jsonwebtoken";
import { redis } from "../utils/redis";

// authenticated user
export const isAuthenticated = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const access_token = req.cookies.access_token as string;

    if (!access_token) {
      return next(
        new ErrorHandeler("Please login to access this resource", 400)
      );
    }

    const decoded = jwt.verify(
      access_token,
      process.env.ACCESS_TOKEN as string
    ) as JwtPayload;

    if (!decoded) {
      return next(new ErrorHandeler("Invalid token payload", 401));
    }

    const user = await redis.get(decoded.id);
    if (!user) {
      return next(new ErrorHandeler("User not found", 404));
    }
    req.user = JSON.parse(user) as any;

    next();
  }
);

// validate user role
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role || "")) {
      return next(
        new ErrorHandeler(
          `Role: ${req.user?.role} is not allowed to access this resource`,
          403
        )
      );
    }

    next();
  };
};

require("dotenv").config();
import express, { NextFunction, Request, Response } from "express";
export const app = express();
import cors from "cors";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middleware/error";

// body parser
app.use(express.json({ limit: "50mb" }));

// cookie parser
app.use(cookieParser());

// cors
app.use(
  cors({
    origin: process.env.ORIGIN,
  })
);

// testing api
app.get("/test", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    message: "Api is working",
    success: true, // Fixed typo here (sucess → success)
  });
});

// unknown route
app.all("/*path", (req: Request, res: Response, next: NextFunction) => {
    const err: any = new Error(`Can't find ${req.originalUrl} on this server!`);
    err.statusCode = 404;
    next(err);
  });
  
  app.use(ErrorMiddleware);
  

// global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

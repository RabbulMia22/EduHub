import { NextFunction, Request, Response } from "express";

export const CathAsyncError = 
(thisFunc : any) => (req : Request, res : Response, next : NextFunction) => {
    Promise.resolve(thisFunc(req, res, next)).catch(next);
};

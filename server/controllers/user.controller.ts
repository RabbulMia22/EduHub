require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import userModel, { IUser } from "../models/user.model";
import ErrorHandeler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncError";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import {
  accessTokenOptions,
  refreshTokenOptions,
  sendToken,
} from "../utils/jwt";
import { redis } from "../utils/redis";
import { getUserById } from "../services/user.service";

// Register User

interface IRegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;

      const isEmailExist = await userModel.findOne({ email });
      if (isEmailExist) {
        return next(new ErrorHandeler("Email already exists", 400));
      }

      const activationToken = createActivatonToken({ name, email, password });
      const activationCode = activationToken.activationCode;

      const data = {
        user: { name },
        activationCode,
      };

      const html = await ejs.renderFile(
        path.join(__dirname, "../mails/activation.mail.ejs"),
        data
      );

      try {
        await sendMail({
          email,
          subject: "Activate your account",
          template: "activation.mail.ejs",
          data,
        });

        res.status(201).json({
          success: true,
          message: "Please check your email to activate your account",
          activationToken: activationToken.token,
        });
      } catch (error: any) {
        return next(new ErrorHandeler(error.message, 400));
      }
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

// Create Activation Token

interface IActivationToken {
  token: string;
  activationCode: string;
}

export const createActivatonToken = (user: {
  name: string;
  email: string;
  password: string;
}): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    { user, activationCode },
    process.env.ACTIVATION_SECRET as Secret,
    {
      expiresIn: "5m",
    }
  );

  return { token, activationCode };
};

// Activate User

interface IActivationRequest {
  activation_token: string;
  activation_code: string;
}

export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activation_token, activation_code } =
        req.body as IActivationRequest;

      const newUser: { user: IRegistrationBody; activationCode: string } =
        jwt.verify(
          activation_token,
          process.env.ACTIVATION_SECRET as string
        ) as any;

      if (newUser.activationCode !== activation_code) {
        return next(new ErrorHandeler("Invalid activation code", 400));
      }

      const { name, email, password } = newUser.user;

      const existUser = await userModel.findOne({ email });

      if (existUser) {
        return next(new ErrorHandeler("User already exists", 400));
      }

      const user = await userModel.create({
        name,
        email,
        password,
        isActivated: true,
      });

      res.status(201).json({
        success: true,
        message: "Account activated successfully. You can now login.",
      });
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

// Login User
interface ILoginRequest {
  email: string;
  password: string;
}

export const loginUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as ILoginRequest;

      if (!email || !password) {
        return next(
          new ErrorHandeler("Please provide email and password", 400)
        );
      }

      const user = await userModel.findOne({ email }).select("+password");
      if (!user) {
        return next(new ErrorHandeler("Invalid email or password", 400));
      }

      const isPasswordMatched = await user.comparePassword(password);
      if (!isPasswordMatched) {
        return next(new ErrorHandeler("Invalid email or password", 400));
      }

      sendToken(user, 200, res);
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

// logout user

export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.cookie("access_token", "", { maxAge: 1 });
      res.cookie("refresh_token", "", { maxAge: 1 });
      const userId = req.user?._id?.toString() || "";
      if (userId) {
        redis.del(userId);
      }

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

// update access token
export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refresh_token = req.cookies.refresh_token as string;

      if (!refresh_token) {
        return next(new ErrorHandeler("Refresh token not provided", 400));
      }

      const decoded = jwt.verify(
        refresh_token,
        process.env.REFRESH_TOKEN as string
      ) as JwtPayload;

      if (!decoded || !decoded.id) {
        return next(new ErrorHandeler("Could not refresh token", 400));
      }

      const session = await redis.get(decoded.id as string);

      if (!session) {
        return next(new ErrorHandeler("Session expired or not found", 400));
      }

      const user = JSON.parse(session);

      const accessToken = jwt.sign(
        { id: user._id },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: "5m" }
      );

      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN as string,
        { expiresIn: "3d" }
      );

      res.cookie("access_token", accessToken, accessTokenOptions);
      res.cookie("refresh_token", refreshToken, refreshTokenOptions);

      res.status(200).json({
        success: true,
        accessToken,
      });
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

// get user details
export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as { _id: string })._id;
      getUserById(userId, res);
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

interface ISocialAuthBody{
  email: string;
  name: string;
  avatar: string;
}

// social auth
export const socialAuth = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, name, avatar } = req.body as ISocialAuthBody;
      const user = await userModel.findOne({ email });
      if (!user) {
        const newUser = await userModel.create({ email, name, avatar });
        sendToken(newUser, 200, res);
      } else {
        sendToken(user, 200, res);
      }
    } catch (error: any) {
      return next(new ErrorHandeler(error.message, 400));
    }
  }
);

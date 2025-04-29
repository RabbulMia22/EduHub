import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncError";
import ErrorHandeler from "../utils/ErrorHandler";
import OrderModel, { IOrder } from "../models/order.Model";
import CourseModel from "../models/course.model";
import userModel from "../models/user.model";
import path from "path";
import ejs from "ejs";
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.Model";
import { newOrder } from "../services/order.service";
import mongoose from "mongoose";

// create order
export const createOrder = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { courseId, payment_info } = req.body as IOrder;

        const user = await userModel.findById(req.user?._id);

        const courseExistInUser = user?.courses.some((course: any) => 
            course.courseId.toString() === new mongoose.Types.ObjectId(courseId).toString()
        );

        if (courseExistInUser) {
            return next(new ErrorHandeler("You have already purchased this course", 400));
        }

        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return next(new ErrorHandeler("Invalid course ID", 400));
        }

        const course = await CourseModel.findById(new mongoose.Types.ObjectId(courseId));

        if (!course) {
            return next(new ErrorHandeler("Course not found", 404));
        }

        const data: any = {
            courseId: course._id,
            userId: user?._id,
            payment_info,
        };

        const mailData = {
            order: {
                _id: course._id.toString().slice(0, 6),
                name: course.name,
                price: course.price,
                date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            }
        };

        const html = await ejs.renderFile(path.join(__dirname, '../mails/orderConfermation.mail.ejs'), { order: mailData });

        try {
            if (user) {
                await sendMail({
                    email: user.email,
                    subject: "Order Confirmation",
                    template: "orderConfermation.mail.ejs",
                    data: mailData,
                });
            }
        } catch (error: any) {
            return next(new ErrorHandeler("Course not found", 404));
        }

        user?.courses.push({ courseId: course._id.toString() });
    await user?.save();


        await NotificationModel.create({
            user: user?._id,
            title: "New Order",
            message: `You have a new order from ${course?.name}`,
        });

        course.purchased = (course.purchased || 0) + 1;
        await course.save();

        

        newOrder(data, res, next);

    } catch (error: any) {
        return next(new ErrorHandeler(error.message, 500));
    }
});

import mongoose, { connect } from "mongoose";
require("dotenv").config();

const dbUrl:string = process.env.DB_URL || '';

const connectDB = async () => {
  try {
    await mongoose.connect(dbUrl).then((data:any) => {
      console.log(`MongoDB connected to ${data.connection.host}`);
      
    });
    console.log("MongoDB connected");
  } catch (error:any) {
    console.log(error.message);
    setTimeout(connectDB, 5000);
  }
};

export default connectDB;
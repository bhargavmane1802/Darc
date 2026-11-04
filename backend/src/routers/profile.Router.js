import { Router } from "express";
import { profileDetails, updateProfileAvatar, updateProfileDetails } from "../controllers/profile.controller.js";
import upload from "../config/cloudinary.js";
export const profileRoutes=Router();
profileRoutes.route("/user").get(profileDetails);
profileRoutes.route("/user").patch(updateProfileDetails);
profileRoutes.route("/user/avatar").patch(upload.single("image"),updateProfileAvatar);

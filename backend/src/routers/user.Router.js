import { Router } from "express";
import { login ,register,verifyEmail} from "../controllers/user.controller.js";
const userRoutes=Router();
userRoutes.route("/login").post(login);
userRoutes.route("/register").post(register);
userRoutes.route('/verify/:id').get(verifyEmail);
export default userRoutes;
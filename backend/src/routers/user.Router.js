import { Router } from "express";
import { login ,register} from "../controllers/user.controller.js";
const userRoutes=Router();
userRoutes.route("/login").post(login);
userRoutes.route("/register").post(register);
export default userRoutes;
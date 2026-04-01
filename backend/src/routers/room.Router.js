import { Router } from "express";
import { create, join, remove } from "../controllers/room.controller.js"
const roomRoutes = Router();
roomRoutes.route("/create").post(create);
roomRoutes.route("/join").post(join);
roomRoutes.route("/remove/:name").delete(remove);
export { roomRoutes };
import { Router } from "express";
import { create, join, remove, myRooms } from "../controllers/room.controller.js"
const roomRoutes = Router();
roomRoutes.route("/my-rooms").get(myRooms);
roomRoutes.route("/create").post(create);
roomRoutes.route("/join/:inviteCode").get(join);
roomRoutes.route("/remove/:name").delete(remove);
export { roomRoutes };
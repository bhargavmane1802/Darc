import { Router } from "express";
import { messageCreate, messageUpdate, messageDelete,messageDisplay } from "../controllers/message.controller.js"
import { verifyRoom } from "../middlwares/roomMember.middlware.js"
const messageRoutes = Router();
messageRoutes.route("/:roomId/create").post(verifyRoom, messageCreate);
messageRoutes.route("/:roomId/update/:messageId").put(verifyRoom, messageUpdate);
messageRoutes.route("/:roomId/delete/:messageId").delete(verifyRoom, messageDelete);
messageRoutes.route("/:roomId/display/").get(verifyRoom, messageDisplay);
export { messageRoutes }; 
import { Router } from "express";
import { messageCreate, messageUpdate, messageDelete } from "../controllers/message.controller.js"
import { verifyRoom } from "../middlwares/roomMember.middlware.js"
const messageRoutes = Router();
messageRoutes.route("/:roomId/create").post(verifyRoom, messageCreate);
messageRoutes.route("/:roomId/update/:messageId").post(verifyRoom, messageUpdate);
messageRoutes.route("/:roomId/delete/:messageId").delete(verifyRoom, messageDelete);
export { messageRoutes }; 
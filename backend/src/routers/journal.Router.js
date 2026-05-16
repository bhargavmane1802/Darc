import {Router} from "express";
import { createEntries, displayEntries,updateEntries,deleteEntries,aiResponses,manageReaction}from "../controllers/journal.controller.js"
import {verifyRoom} from "../middlewares/roomMember.middlware.js"
import aiRateLimit from "../middlewares/aiRateLimit.middleware.js";
const journalRoutes=Router();
journalRoutes.route("/:roomId/create").post(verifyRoom,createEntries);
journalRoutes.route("/:roomId/display").get(verifyRoom,displayEntries);
journalRoutes.route("/:roomId/update/:journalId").put(verifyRoom,updateEntries);
journalRoutes.route("/:roomId/delete/:journalId").delete(verifyRoom,deleteEntries);
journalRoutes.route("/:roomId/aiResponse/:journalId").get(verifyRoom,aiRateLimit,aiResponses);
journalRoutes.route("/:roomId/reaction/:journalId").patch(verifyRoom,manageReaction);
export {journalRoutes}; 
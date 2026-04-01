import {Router} from "express";
import { createEntries, displayEntries,updateEntries,deleteEntries }from "../controllers/journal.controller.js"
import {verifyRoom} from "../middlwares/roomMember.middlware.js"
const journalRoutes=Router();
journalRoutes.route("/:roomId/create").post(verifyRoom,createEntries);
journalRoutes.route("/:roomId/display").get(verifyRoom,displayEntries);
journalRoutes.route("/:roomId/update/:journalId").put(verifyRoom,updateEntries);
journalRoutes.route("/:roomId/delete/:journalId").delete(verifyRoom,deleteEntries);
export {journalRoutes}; 
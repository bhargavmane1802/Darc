import {Router} from "express";
import {createEntries,displayEntries} from "../controllers/journal.controller.js"
import {verifyRoom} from "../middlwares/roomMember.middlware.js"
const journalRoutes=Router();
journalRoutes.route("/:roomId/create").post(verifyRoom,createEntries);
journalRoutes.route("/:roomId/display").post(verifyRoom,displayEntries);
export {journalRoutes}; 
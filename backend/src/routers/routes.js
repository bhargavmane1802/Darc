import { Router } from "express";
import {create,join,remove} from "../controllers/room.controller.js"
import {verifyRoom, createEntries} from "../controllers/journal.controller.js"
const routes=Router();
routes.route("/create").post(create);
routes.route("/join").post(join);
// routes.route("/update").post(update);
routes.route("/remove").delete(remove);
routes.route("/:roomId/entries/create").post(verifyRoom,createEntries);

export default routes;
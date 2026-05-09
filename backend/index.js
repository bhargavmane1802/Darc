import mongoose from "mongoose"
import express, { urlencoded } from "express"
import dotenv from "dotenv"
import userRoutes from "./src/routers/user.Router.js"
import validate_auth from "./src/middlwares/auth.middlware.js"
import { user_Model } from "./src/model/user.model.js"
import { journalRoutes } from "./src/routers/journal.Router.js"
import { messageRoutes } from "./src/routers/message.Router.js"
import { roomRoutes } from "./src/routers/room.Router.js"
import http from "http"
import { initSocket } from "./src/sockets/socket.js"
dotenv.config();
const app = express();
const server = http.createServer(app);
initSocket(server);
const port = 8080;
const main = async () => {
    try {
        await mongoose.connect(process.env.Mongo_Url);
        console.log("DB conneccted");
    }
    catch (e) {
        console.log(e);
    }
}
main();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
server.listen(port, () => {
    console.log("listning at port 8080");
})
app.use("/user", userRoutes);
app.use("/auth/", validate_auth);
app.use("/auth/room", roomRoutes);
app.use("/auth/journal", journalRoutes);
app.use("/auth/message", messageRoutes);
app.get("/auth/", async (req, res) => {
    try {
        console.log(req.user);
        const { username, id } = req.user;
        const user = await user_Model.findById({ _id: id });
        console.log(user);
        if (!user) return res.status(404).json({ message: "usernot found" });
        return res.status(200).json({ message: user });
    }
    catch (e) {
        return res.status(404).json({ message: "usernot found", e });
    }
})
app.get("/", (req, res) => {
    return res.send("it is working");
})
app.use("/", (err, req, res, next) => {
    return res.send("Error 404");
})
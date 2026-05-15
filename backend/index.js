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
import startDigestJob from "./src/jobs/digest.job.js"
import uploadRouter from "./src/routers/upload.routes.js"
import cors from "cors";
dotenv.config();
const app = express();
const server = http.createServer(app);
initSocket(server);
const port = 8080;
const main = async () => {
    try {
        await mongoose.connect(process.env.Mongo_Url);
        console.log("DB connected");
    }
    catch (e) {
        console.log(e);
    }
}
main();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allowed origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.CLIENT_URL
];

app.use(
  cors({
    origin: function (origin, callback) {

      // Allow requests with no origin
      // (mobile apps, postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS not allowed")
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]
  })
);

server.listen(port, () => {
    console.log("listning at port 8080");
})
app.use("/user", userRoutes);
app.use("/auth/", validate_auth);
app.use("/auth/room", roomRoutes);
app.use("/auth/journal", journalRoutes);
app.use("/auth/message", messageRoutes);
app.use("/auth/upload", uploadRouter);
app.get("/test", async(req, res) => {
    //just for testing porpose move to main after wards
    await startDigestJob();
    return res.send("it is working");
})
app.use("/", (err, req, res, next) => {
    return res.send("Error 404");
})
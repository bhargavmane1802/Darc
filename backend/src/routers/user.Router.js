import { Router } from "express";
import { 
    login, 
    register, 
    verifyEmail,
    loginSocket,
    registerSocket,
    verifyEmailSocket
} from "../controllers/user.controller.js";

const userRoutes = Router();
// HTTP Routes (commented out in favor of Socket.IO routes)
// userRoutes.route("/login").post(login());
// userRoutes.route("/register").post(register());
// userRoutes.route('/verify/:id').get(verifyEmail());
export default userRoutes;

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for User Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO Route Names / Events equivalent to HTTP Routes:
 * - POST /login       => "user:login" / "login"
 * - POST /register    => "user:register" / "register"
 * - GET  /verify/:id  => "user:verify" / "verify_email"
 */
export const USER_SOCKET_ROUTES = {
    LOGIN: "user:login",
    REGISTER: "user:register",
    VERIFY: "user:verify",
    VERIFY_EMAIL: "user:verify_email",
};

/**
 * Socket Route: Equivalent to POST /login
 */
export const userLoginRoute = async (data = {}, socket, io, callback) => {
    try {
        return await loginSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("userLoginRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to POST /register
 */
export const userRegisterRoute = async (data = {}, socket, io, callback) => {
    try {
        return await registerSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("userRegisterRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to GET /verify/:id
 */
export const userVerifyRoute = async (data = {}, socket, io, callback) => {
    try {
        return await verifyEmailSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("userVerifyRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Registers all user Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerUserSocketRoutes = (socket, io) => {
    // 1. Login: POST /login
    socket.on(USER_SOCKET_ROUTES.LOGIN, (data, callback) => userLoginRoute(data, socket, io, callback));
    socket.on("login", (data, callback) => userLoginRoute(data, socket, io, callback));
    socket.on("user_login", (data, callback) => userLoginRoute(data, socket, io, callback));

    // 2. Register: POST /register
    socket.on(USER_SOCKET_ROUTES.REGISTER, (data, callback) => userRegisterRoute(data, socket, io, callback));
    socket.on("register", (data, callback) => userRegisterRoute(data, socket, io, callback));
    socket.on("user_register", (data, callback) => userRegisterRoute(data, socket, io, callback));

    // 3. Verify Email: GET /verify/:id
    socket.on(USER_SOCKET_ROUTES.VERIFY, (data, callback) => userVerifyRoute(data, socket, io, callback));
    socket.on(USER_SOCKET_ROUTES.VERIFY_EMAIL, (data, callback) => userVerifyRoute(data, socket, io, callback));
    socket.on("verify_email", (data, callback) => userVerifyRoute(data, socket, io, callback));
    socket.on("user_verify", (data, callback) => userVerifyRoute(data, socket, io, callback));
};

// Aliases
export const userSocketRouter = registerUserSocketRoutes;
export const userSocketRoutes = registerUserSocketRoutes;

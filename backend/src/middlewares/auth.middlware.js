import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config();

const validate_auth = (jwtLib = jwt) => async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "unauthorized user" });
        }
        const token = authHeader.split(" ")[1];
        const decoded = jwtLib.verify(token, process.env.Jwt_Key);
        req.user = decoded;
        return next();
    }
    catch (e) {
        console.log("failed to validate user");
        e.message = "error in auth validation";
        return next(e);
    }
};
export default validate_auth;

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Middleware: validate_auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO connection authentication middleware (io.use).
 * Extracts JWT token from handshake auth, authorization header, or query.
 * Verifies token and attaches decoded user to socket.user.
 * 
 * Usage:
 *   io.use(socketAuthMiddleware());
 *   // or
 *   io.use(validateSocketAuth());
 */
export const validateSocketAuth = (jwtLib = jwt) => (socket, next) => {
    try {
        const authHeader = socket.handshake?.headers?.authorization;
        const authToken = socket.handshake?.auth?.token;
        const queryToken = socket.handshake?.query?.token;

        let token = null;

        if (authToken) {
            token = authToken.startsWith("Bearer ") ? authToken.split(" ")[1] : authToken;
        } else if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        } else if (queryToken) {
            token = queryToken.startsWith("Bearer ") ? queryToken.split(" ")[1] : queryToken;
        }

        if (!token) {
            return next(new Error("unauthorized user"));
        }

        const decoded = jwtLib.verify(token, process.env.Jwt_Key);
        socket.user = decoded;
        return next();
    } catch (e) {
        console.error("failed to validate user (socket):", e.message);
        return next(new Error("error in auth validation"));
    }
};

/**
 * Socket.IO packet-level authentication middleware (socket.use).
 * Ensures every incoming event packet originates from an authenticated socket.
 * 
 * Usage:
 *   socket.use(socketAuthPacket());
 */
export const socketAuthPacket = () => ([event, data, callback], next) => {
    // If socket has already been authenticated via connection middleware
    // allow public events if needed (e.g., login, register)
    if (event === "login" || event === "register" || event === "verify_email") {
        return next();
    }
    next();
};

/**
 * Event-level wrapper: wraps an individual socket event handler to ensure authenticated user exists.
 * 
 * Usage:
 *   socket.on("protected_event", withSocketAuth()(handler));
 */
export const withSocketAuth = (jwtLib = jwt) => (handler) => async (data, socket, io, callback) => {
    try {
        let user = socket?.user;

        // If not attached to socket, check if token was passed in data payload
        if (!user && data?.token) {
            const rawToken = data.token.startsWith("Bearer ") ? data.token.split(" ")[1] : data.token;
            user = jwtLib.verify(rawToken, process.env.Jwt_Key);
            if (socket) socket.user = user;
        }

        if (!user) {
            if (typeof callback === "function") {
                return callback({ status: 401, message: "unauthorized user" });
            }
            socket?.emit("error", { message: "unauthorized user", status: 401 });
            return;
        }

        return await handler(data, socket, io, callback);
    } catch (e) {
        console.error("failed to validate user (event auth):", e.message);
        if (typeof callback === "function") {
            return callback({ status: 401, message: "error in auth validation" });
        }
        socket?.emit("error", { message: "error in auth validation", status: 401 });
    }
};

// Aliases
export const socketAuthMiddleware = validateSocketAuth;
export const authSocketMiddleware = validateSocketAuth;
export const validate_auth_socket = validateSocketAuth;

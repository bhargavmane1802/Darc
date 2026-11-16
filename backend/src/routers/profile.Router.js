import { Router } from "express";
import { 
    profileDetails, 
    updateProfileAvatar, 
    updateProfileDetails,
    profileDetailsSocket,
    updateProfileDetailsSocket,
    updateProfileAvatarSocket
} from "../controllers/profile.controller.js";
import upload from "../config/cloudinary.js";

export const profileRoutes = Router();
// HTTP Routes (commented out in favor of Socket.IO routes)
// profileRoutes.route("/user").get(profileDetails);
// profileRoutes.route("/user").patch(updateProfileDetails);
// profileRoutes.route("/user/avatar").patch(upload.single("image"), updateProfileAvatar);

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for Profile Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO Route Names / Events equivalent to HTTP Routes:
 * - GET   /user        => "profile:details" / "profile:get"
 * - PATCH /user        => "profile:update"
 * - PATCH /user/avatar => "profile:avatar" / "profile:update_avatar"
 */
export const PROFILE_SOCKET_ROUTES = {
    DETAILS: "profile:details",
    GET: "profile:get",
    UPDATE: "profile:update",
    AVATAR: "profile:avatar",
    UPDATE_AVATAR: "profile:update_avatar",
};

/**
 * Socket Route: Equivalent to GET /user
 */
export const profileDetailsRoute = async (data = {}, socket, io, callback) => {
    try {
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await profileDetailsSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("profileDetailsRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to PATCH /user
 */
export const profileUpdateRoute = async (data = {}, socket, io, callback) => {
    try {
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await updateProfileDetailsSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("profileUpdateRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to PATCH /user/avatar
 */
export const profileAvatarRoute = async (data = {}, socket, io, callback) => {
    try {
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await updateProfileAvatarSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("profileAvatarRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Registers all profile Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerProfileSocketRoutes = (socket, io) => {
    // 1. Profile Details: GET /user
    socket.on(PROFILE_SOCKET_ROUTES.DETAILS, (data, callback) => profileDetailsRoute(data, socket, io, callback));
    socket.on(PROFILE_SOCKET_ROUTES.GET, (data, callback) => profileDetailsRoute(data, socket, io, callback));
    socket.on("profile_details", (data, callback) => profileDetailsRoute(data, socket, io, callback));
    socket.on("get_profile", (data, callback) => profileDetailsRoute(data, socket, io, callback));

    // 2. Profile Update: PATCH /user
    socket.on(PROFILE_SOCKET_ROUTES.UPDATE, (data, callback) => profileUpdateRoute(data, socket, io, callback));
    socket.on("profile_update", (data, callback) => profileUpdateRoute(data, socket, io, callback));
    socket.on("update_profile", (data, callback) => profileUpdateRoute(data, socket, io, callback));

    // 3. Avatar Update: PATCH /user/avatar
    socket.on(PROFILE_SOCKET_ROUTES.AVATAR, (data, callback) => profileAvatarRoute(data, socket, io, callback));
    socket.on(PROFILE_SOCKET_ROUTES.UPDATE_AVATAR, (data, callback) => profileAvatarRoute(data, socket, io, callback));
    socket.on("avatar_update", (data, callback) => profileAvatarRoute(data, socket, io, callback));
    socket.on("update_avatar", (data, callback) => profileAvatarRoute(data, socket, io, callback));
};

// Aliases
export const profileSocketRouter = registerProfileSocketRoutes;
export const profileSocketRoutes = registerProfileSocketRoutes;

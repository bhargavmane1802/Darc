import express from "express";
import upload from "../config/cloudinary.js";
import validate_auth from "../middlewares/auth.middlware.js"

const router = express.Router();

// HTTP Routes (commented out in favor of Socket.IO routes)
// 'image' is the name of the field in the multipart/form-data request
// router.post("/", validate_auth(), upload.single("image"), (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No image file provided." });
//     }
//     // req.file contains the Cloudinary URL and Public ID
//     res.status(200).json({
//       imageUrl: req.file.path,
//       publicId: req.file.filename,
//     });
//   } catch (error) {
//     console.error("Upload Error:", error);
//     res.status(500).json({ message: "Failed to upload image." });
//   }
// });
// 
// // Optional: Add Multer error handling (e.g., File too large)
// router.use((err, req, res, next) => {
//   if (err.code === "LIMIT_FILE_SIZE") {
//     return res.status(413).json({ message: "File exceeds the 5MB limit." });
//   }
//   next(err);
// });

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for Upload Router
// ─────────────────────────────────────────────────────────────────────────────

import { v2 as cloudinary } from "cloudinary";

/**
 * Socket.IO Route Names / Events equivalent to HTTP POST /
 * - POST / => "upload:image" / "upload:file"
 */
export const UPLOAD_SOCKET_ROUTES = {
    UPLOAD: "upload:image",
    FILE: "upload:file",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit matching multer config

/**
 * Helper to upload buffer to Cloudinary via upload_stream
 */
const uploadBufferToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "darc_app_uploads",
                resource_type: "auto",
                ...options,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
};

/**
 * Socket Route: Equivalent to POST / (with validate_auth and upload.single("image"))
 * Accepts:
 *   - Base64 string / Data URI: { image: "data:image/png;base64,..." } or { file: "..." }
 *   - Binary Buffer / ArrayBuffer: { file: Buffer, fileName?: "..." }
 *   - Direct image URL: { image: "http...", publicId?: "..." }
 */
export const uploadSocketRoute = async (data = {}, socket, io, callback) => {
    try {
        // 1. Auth verification (equivalent to validate_auth middleware)
        const userId = socket?.user?.id || socket?.user?._id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") {
                return callback({ status: 401, message: "unauthorized user" });
            }
            socket?.emit("error", { message: "unauthorized user", status: 401 });
            return;
        }

        // 2. Extract image/file payload
        const rawFile = data?.image || data?.file || data?.buffer || data?.data;
        if (!rawFile) {
            if (typeof callback === "function") {
                return callback({ status: 400, message: "No image file provided." });
            }
            socket?.emit("error", { message: "No image file provided.", status: 400 });
            return;
        }

        // 3. File size limit check (5MB limit matching Multer)
        let isTooLarge = false;
        if (Buffer.isBuffer(rawFile)) {
            if (rawFile.length > MAX_FILE_SIZE) isTooLarge = true;
        } else if (typeof rawFile === "string" && rawFile.startsWith("data:")) {
            const approximateSize = (rawFile.length * 3) / 4;
            if (approximateSize > MAX_FILE_SIZE) isTooLarge = true;
        }

        if (isTooLarge) {
            if (typeof callback === "function") {
                return callback({ status: 413, message: "File exceeds the 5MB limit." });
            }
            socket?.emit("error", { message: "File exceeds the 5MB limit.", status: 413 });
            return;
        }

        // 4. Perform upload to Cloudinary
        let result;
        if (Buffer.isBuffer(rawFile)) {
            result = await uploadBufferToCloudinary(rawFile);
        } else if (typeof rawFile === "string") {
            // Base64 data URI or image URL string
            result = await cloudinary.uploader.upload(rawFile, {
                folder: "darc_app_uploads",
                resource_type: "auto",
            });
        } else {
            if (typeof callback === "function") {
                return callback({ status: 400, message: "Invalid image format provided." });
            }
            socket?.emit("error", { message: "Invalid image format provided.", status: 400 });
            return;
        }

        const responsePayload = {
            imageUrl: result.secure_url || result.url,
            publicId: result.public_id,
        };

        if (typeof callback === "function") {
            callback({ status: 200, ...responsePayload });
        }
        socket?.emit("upload_success", responsePayload);
        socket?.emit("image_uploaded", responsePayload);
        return responsePayload;
    } catch (error) {
        console.error("Upload Error (socket):", error);
        if (typeof callback === "function") {
            callback({ status: 500, message: "Failed to upload image." });
        }
        socket?.emit("error", { message: "Failed to upload image.", status: 500 });
    }
};

/**
 * Registers upload Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerUploadSocketRoutes = (socket, io) => {
    socket.on(UPLOAD_SOCKET_ROUTES.UPLOAD, (data, callback) => uploadSocketRoute(data, socket, io, callback));
    socket.on(UPLOAD_SOCKET_ROUTES.FILE, (data, callback) => uploadSocketRoute(data, socket, io, callback));
    socket.on("upload", (data, callback) => uploadSocketRoute(data, socket, io, callback));
    socket.on("image_upload", (data, callback) => uploadSocketRoute(data, socket, io, callback));
    socket.on("file_upload", (data, callback) => uploadSocketRoute(data, socket, io, callback));
};

// Aliases
export const uploadSocketRouter = registerUploadSocketRoutes;
export const uploadSocketRoutes = registerUploadSocketRoutes;



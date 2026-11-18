import { deleteImage } from "../config/cloudinary.js";
import { user_Model } from "../model/user.model.js";
import jwt from "jsonwebtoken";

export const profileDetails=async (req,res,next)=>{
    const {id}=req.user;
    // retrive all the details of the user and and send 
    // first check on the redis id the user details are available if yes then send it from redis it self 
    try {
        const profile=await user_Model.findById(id).select('-password').lean();
        if(!profile)return res.status(404).json({message:"user not found"});
        const resolvedImage = profile.imageUrl || profile.avatar || null;
        profile.imageUrl = resolvedImage;
        profile.avatar = resolvedImage;
        return res.status(200).json(profile);
    } catch (err) {
        next(err)
    }
}
export const updateProfileDetails=async(req,res,next)=>{
    try{const {id}=req.user;
    // use put operation , will be able to update , name , about ,status
    const {name,about,status}=req.body;
    const updatedProfile= await user_Model.findByIdAndUpdate(id,{$set: {name:name,about:about,status:status}},{ new: true }).select('-password');
    if(!updatedProfile)return res.status(404).json({message:"user not found"});
    return res.status(200).json(updatedProfile);}
    catch(err){
        next(err);
    }
}
export const updateProfileAvatar=async (req,res,next)=>{
    try{const {id}=req.user;
    const imageUrl = req.file ? req.file.path : null;
    const publicId=req.file ? req.file.filename : null;
    const updatedProfile=await user_Model.findByIdAndUpdate(id,{$set: {imageUrl:imageUrl,avatar:imageUrl,publicId:publicId}},{ returnDocument: "before"}).select('publicId');
    if(!updatedProfile)return res.status(404).json({message:"user not found"});
    //delete the previous image from cloudinary using its public id if it exists;
    if (updatedProfile.publicId && updatedProfile.publicId !== publicId) {
        try {
            await deleteImage(updatedProfile.publicId);
        } catch (delErr) {
            console.error("Cloudinary previous avatar deletion failed:", delErr);
        }
    }
    return res.status(200).json({imageUrl, avatar: imageUrl});}
    catch(err){
        next(err)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of profileDetails
 * Event: "profile_details" or "get_profile"
 * Emits to caller: "profile_details" (or executes callback)
 */
const profileDetailsSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return profileDetailsSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
    } else if (args[0]) {
        UserModel = args[0];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            const profile = await UserModel.findById(id).select('-password').lean();
            if (!profile) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "user not found" });
                }
                socket?.emit("error", { message: "user not found" });
                return;
            }

            const resolvedImage = profile.imageUrl || profile.avatar || null;
            profile.imageUrl = resolvedImage;
            profile.avatar = resolvedImage;

            if (socket?.user) {
                socket.user.imageUrl = resolvedImage;
                socket.user.avatar = resolvedImage;
            }

            if (typeof callback === "function") {
                callback({ status: 200, data: profile });
            }
            socket?.emit("profile_details", profile);
            return profile;
        } catch (err) {
            console.error("Failed to get profile details (socket):", err);
            err.message = "Failed profileDetails";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed profileDetails", error: err.message });
            }
            socket?.emit("error", { message: "Failed profileDetails", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of updateProfileDetails
 * Event: "profile_update" or "update_profile"
 * Emits to caller: "profile_updated" (or executes callback)
 */
const updateProfileDetailsSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return updateProfileDetailsSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
    } else if (args[0]) {
        UserModel = args[0];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            const { name, about, status } = data;
            const updatedProfile = await UserModel.findByIdAndUpdate(
                id,
                { $set: { name, about, status } },
                { new: true }
            ).select('-password');

            if (!updatedProfile) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "user not found" });
                }
                socket?.emit("error", { message: "user not found" });
                return;
            }

            if (typeof callback === "function") {
                callback({ status: 200, data: updatedProfile });
            }
            socket?.emit("profile_updated", updatedProfile);
            return updatedProfile;
        } catch (err) {
            console.error("Failed to update profile details (socket):", err);
            err.message = "Failed updateProfileDetails";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed updateProfileDetails", error: err.message });
            }
            socket?.emit("error", { message: "Failed updateProfileDetails", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of updateProfileAvatar
 * Event: "avatar_update" or "update_avatar"
 * Emits to caller: "avatar_updated" (or executes callback)
 */
const updateProfileAvatarSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return updateProfileAvatarSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;
    let deleteImageFn = deleteImage;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
        if (args[0].deleteImage) deleteImageFn = args[0].deleteImage;
    } else {
        if (args[0]) UserModel = args[0];
        if (args[1]) deleteImageFn = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            const imageUrl = data.imageUrl || data.image_url || data.avatar || null;
            const publicId = data.publicId || data.public_id || null;

            const updatedProfile = await UserModel.findByIdAndUpdate(
                id,
                { $set: { imageUrl, avatar: imageUrl, publicId } },
                { returnDocument: "before" }
            ).select('publicId');

            if (!updatedProfile) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "user not found" });
                }
                socket?.emit("error", { message: "user not found" });
                return;
            }

            // delete the previous image from cloudinary using its public id if it exists
            if (updatedProfile.publicId && updatedProfile.publicId !== publicId) {
                try {
                    await deleteImageFn(updatedProfile.publicId);
                } catch (delErr) {
                    console.error("Cloudinary previous avatar deletion failed (socket):", delErr);
                }
            }

            if (socket?.user) {
                socket.user.imageUrl = imageUrl;
                socket.user.avatar = imageUrl;
            }

            let token;
            if (process.env.Jwt_Key && socket?.user?.username) {
                token = jwt.sign(
                    {
                        id,
                        username: socket.user.username,
                        imageUrl,
                        avatar: imageUrl,
                    },
                    process.env.Jwt_Key,
                    { expiresIn: "1h" }
                );
            }

            const result = token
                ? { imageUrl, avatar: imageUrl, token }
                : { imageUrl, avatar: imageUrl };

            if (typeof callback === "function") {
                callback({ status: 200, data: result });
            }
            socket?.emit("avatar_updated", result);
            return result;
        } catch (err) {
            console.error("Failed to update profile avatar (socket):", err);
            err.message = "Failed updateProfileAvatar";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed updateProfileAvatar", error: err.message });
            }
            socket?.emit("error", { message: "Failed updateProfileAvatar", error: err.message });
        }
    };
};

// Aliases matching handle* convention
const handleProfileDetails = profileDetailsSocket;
const handleUpdateProfileDetails = updateProfileDetailsSocket;
const handleUpdateProfileAvatar = updateProfileAvatarSocket;
const handleGetProfile = profileDetailsSocket;
const handleProfileUpdate = updateProfileDetailsSocket;
const handleAvatarUpdate = updateProfileAvatarSocket;

export {
    profileDetailsSocket,
    updateProfileDetailsSocket,
    updateProfileAvatarSocket,
    handleProfileDetails,
    handleUpdateProfileDetails,
    handleUpdateProfileAvatar,
    handleGetProfile,
    handleProfileUpdate,
    handleAvatarUpdate,
};

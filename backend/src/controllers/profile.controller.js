import { deleteImage } from "../config/cloudinary.js";
import { user_Model } from "../model/user.model.js";

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
export const resetPassword=async()=>{

}

import { user_Model } from "../model/user.model.js";

export const profileDetails=async (req,res,next)=>{
    const {id}=req.user;
    // retrive all the details of the user and and send 
    // first check on the redis id the user details are available if yes then send it from redis it self 
    try {
        const profile=await user_Model.findById(id).select('-password');
        if(!profile)return res.status(404).json({message:"user not found"});
        return res.status(200).json(profile);
    } catch (err) {
        next(err)
    }
}
export const updateProfileDetails=async(req,res,next)=>{
    try{const {id}=req.user;
    // use put operation , will be able to update , name , about ,status
    const {name,about,status}=req.body;
    const updatedProfile= await user_Model.findByIdAndReplace(id,{$set: {name:name,about:about,status:status}},{ new: true }).select('-password');
    if(!updatedProfile)return res.status(404).json({message:"user not found"});
    return res.status(200).json(updatedProfile);}
    catch(err){
        next(err);
    }
}
export const updateProfileAvatar=async (req,res,next)=>{
    try{const {id}=req.user;
    const imageUrl = req.file ? req.file.path : null;
    const updatedProfile=await user_Model.findByIdAndUpdate(id,{$set: {imageUrl:imageUrl, avatar:imageUrl}},{ new: true }).select('-password');
    if(!updatedProfile)return res.status(404).json({message:"user not found"});
    return res.status(200).json({ imageUrl, avatar: imageUrl, profile: updatedProfile });}
    catch(err){
        next(err)
    }
}
export const resetPassword=async()=>{

}

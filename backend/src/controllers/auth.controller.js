import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config();
const validate_auth=async(req,res,next)=>{
    try{
        const authHeader=req.headers.authorization;
        if(!authHeader || !authHeader.startsWith("Bearer ")){return res.status(400).json({message:"do not have access redirect to login page 1"})};
        const token=authHeader.split(" ")[1];
        const decoded= jwt.verify(token,process.env.Jwt_Key);
        req.user=decoded;
        return next();
    }
    catch(e){
        console.log(e);
        return res.status(400).json({message:"do not have access"});
    }
}
export default validate_auth;
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config();
const validate_auth=async(req,res,next)=>{
    try{
        const authHeader=req.headers.authorization;
        if(!authHeader || !authHeader.startsWith("Bearer ")){return res.status(401).json({message:"unauthorized user"})};
        const token=authHeader.split(" ")[1];
        const decoded= jwt.verify(token,process.env.Jwt_Key);
        req.user=decoded;
        return next();
    }
    catch(e){
        console.log("failed to validate user");
        e.message="error in auth validation"
        return next(e);
    }
}
export default validate_auth;
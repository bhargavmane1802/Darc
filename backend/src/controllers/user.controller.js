import {User_Model} from "../model/user.model.js"
const login=async(req,res)=>{
    try{
        const {username,password}=req.body;
    if(!username || !password)return res.send("incomplete information");
    const user=await User_Model.findOne({username:username});
    if(!user || user.password!=password)return res.send(" Incorrect credentials");
    return res.send("login successful");
    
    }
    catch(e){
        console.log(e);
        res.send(e);
    }
}
export {login}
const register=async(req,res)=>{
    try{const {username,password}=req.body;
    if(!username || !password)return res.send(" insufficient info");
    const user= await User_Model.findOne({username:username});
    console.log(user);
    if(user)return res.send(`username already exists ${user}`);
    const newuser= new User_Model({
        username:username,
        password:password
    })
    await newuser.save();
    console.log("user saved");
    res.send("usersaved");
    }   
    catch(e){
        console.log("something went wrong");
    }
    
}
export {register}
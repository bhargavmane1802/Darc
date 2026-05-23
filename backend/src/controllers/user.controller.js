import { user_Model } from "../model/user.model.js"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
const login = async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({message:"missing data"})
        username = username.toLowerCase();
        const user = await user_Model.findOne({ username: username });
        if (!user) {
            return res.status(401).json({message:" Incorrect credentials"});
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({message:"Incorrect credentials"});
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.Jwt_Key, { expiresIn: '1h' });
        res.status(200).json({ token });
    }
    catch (e) {
        return next(e);
    }
}
const register = async (req, res, next) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({
                message: "Username and password are required"
            });
        username = username.toLowerCase();
        const user = await user_Model.findOne({ username: username });
        if (user) return res.status(409).json({message:`username already exists`});
        const hashed_password = await bcrypt.hash(password, 10);
        const newuser = new user_Model({
            username: username,
            password: hashed_password,
        })
        await newuser.save();
        console.log("user saved");
        res.status(201).json({ message: "user register redirect to login page" });
    }
    catch (err) {
        return next(err);
    }

}
export { register, login }
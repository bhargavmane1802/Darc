import { user_Model } from "../model/user.model.js"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
const login = async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.send("incomplete information");
        username = username.toLowerCase();
        const user = await user_Model.findOne({ username: username });
        if (!user) {
            return res.send(" Incorrect credentials 1");
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.send(" Incorrect credentials 2");
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.Jwt_Key, { expiresIn: '1h' });
        res.status(201).json({ token });
    }
    catch (e) {
        console.log(e);
        return res.send(e);
    }
}
const register = async (req, res, next) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.send(" insufficient info");
        username = username.toLowerCase();
        const user = await user_Model.findOne({ username: username });
        if (user) return res.send(`username already exists`);
        const hashed_password = await bcrypt.hash(password, 10);
        const newuser = new user_Model({
            username: username,
            password: hashed_password,
        })
        await newuser.save();
        console.log("user saved");
        res.status(200).json({ message: "user register now redirect to login page" });
    }
    catch (err) {
        console.log("something went wrong regirect to login page ", err);
        return next(err);
    }

}
export { register, login }
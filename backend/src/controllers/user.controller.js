import { user_Model } from "../model/user.model.js"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import dns from "dns/promises";
import redis from '../config/redis.js'
import { nanoid } from "nanoid";
import { sendVerificationEmail as sendVerificationEmailFactory } from "../services/email.service.js";
const _sendVerificationEmail = sendVerificationEmailFactory();

const login = (UserModel = user_Model, jwtLib = jwt, bcryptLib = bcrypt) =>
    async (req, res, next) => {
        try {
            let { username, password } = req.body;
            if (!username || !password) return res.status(400).json({message:"missing data"})
            username = username.toLowerCase();
            const user = await UserModel.findOne({ username: username });
            if (!user) {
                return res.status(401).json({message:" Incorrect credentials"});
            }
            const match = await bcryptLib.compare(password, user.password);
            if (!match) return res.status(401).json({message:"Incorrect credentials"});
            const token = jwtLib.sign({ id: user._id, username: user.username }, process.env.Jwt_Key, { expiresIn: '1h' });
            res.status(200).json({ token });
        }
        catch (e) {
            next(e);
        }
    };

const register = (
    UserModel = user_Model,
    bcryptLib = bcrypt,
    dnsLib = dns,
    generateId = nanoid,
    redisClient = redis,
    emailService = _sendVerificationEmail
) => async (req, res, next) => {
    try {
        let { username, password, email } = req.body;
        if (!username || !password || !email) return res.status(400).json({
                message: "Username and password are required"
            });
        username = username.toLowerCase();
        email = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }
        const user = await UserModel.findOne({
            $or: [
                { username },
                { email }
            ]
        });
        if (user) return res.status(409).json({message:`username or email already exists`});
        const domain = email.split("@")[1];
        try {
            await dnsLib.resolveMx(domain);
        } catch {
            return res.status(400).json({
                message: "Email domain does not exist"
            });
        }
        const hashed_password = await bcryptLib.hash(password, 10);
        const id = generateId(10);
        await redisClient.set(
            id,
            JSON.stringify({
                username,
                password: hashed_password,
                email
            })
        );

        await redisClient.expire(id, 300);
        try {
            await emailService(email, id);
        }
        catch(err){
            console.log(err);
            return res.status(400).json({
                message: "error in verification"
            });

        }
        // send a email with url domain/verify/id
        console.log("Verification Email sent");
        res.status(201).json({ message: "user register redirect to login page" });
    }
    catch (err) {
        return next(err);
    }
};

const verifyEmail = (UserModel = user_Model, redisClient = redis) =>
    async (req, res, next) => {
        try {
            const {id} = req.params;
            const data = await redisClient.get(id);

            if (!data) {
                return res.status(400).json({
                    message: "Invalid or expired token"
                });
            }

            const user = JSON.parse(data);
            const existingUser = await UserModel.findOne({
                $or: [
                    { username: user.username },
                    { email: user.email }
                ]
            });

            if (existingUser) {
                await redisClient.del(id);

                return res.status(409).json({
                    message: "User already verified"
                });
            }
            const newuser = new UserModel({
                username: user.username,
                password: user.password,
                email: user.email
            });
            await newuser.save();
            await redisClient.del(id);
            res.redirect(
                `${process.env.FRONTEND_URL}/login?verified=true`
            );

        } catch (error) {
            next(error);
        }
    };

export { register, login, verifyEmail }
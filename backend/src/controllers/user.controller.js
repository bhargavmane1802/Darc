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
            const resolvedImage = user.imageUrl || user.avatar || null;
            const token = jwtLib.sign({ id: user._id, username: user.username, imageUrl: resolvedImage, avatar: resolvedImage }, process.env.Jwt_Key, { expiresIn: '1h' });
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
        /*
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
        */

        const newuser = new UserModel({
            username,
            password: hashed_password,
            email
        });
        await newuser.save();

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

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of login
 * Event: "login" or "user_login"
 * Emits to caller: "login_success" (or executes callback)
 */
const loginSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return loginSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;
    let jwtLib = jwt;
    let bcryptLib = bcrypt;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
        if (args[0].jwtLib) jwtLib = args[0].jwtLib;
        if (args[0].bcryptLib) bcryptLib = args[0].bcryptLib;
    } else {
        if (args[0]) UserModel = args[0];
        if (args[1]) jwtLib = args[1];
        if (args[2]) bcryptLib = args[2];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            let { username, password } = data;
            if (!username || !password) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "missing data" });
                }
                socket?.emit("error", { message: "missing data" });
                return;
            }

            username = username.toLowerCase();
            const user = await UserModel.findOne({ username });
            if (!user) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: " Incorrect credentials" });
                }
                socket?.emit("error", { message: " Incorrect credentials" });
                return;
            }

            const match = await bcryptLib.compare(password, user.password);
            if (!match) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Incorrect credentials" });
                }
                socket?.emit("error", { message: "Incorrect credentials" });
                return;
            }

            const resolvedImage = user.imageUrl || user.avatar || null;
            const token = jwtLib.sign(
                { id: user._id, username: user.username, imageUrl: resolvedImage, avatar: resolvedImage },
                process.env.Jwt_Key,
                { expiresIn: '1h' }
            );

            if (socket) {
                socket.user = { id: user._id, username: user.username, imageUrl: resolvedImage, avatar: resolvedImage };
            }

            const response = {
                token,
                user: { id: user._id, username: user.username, email: user.email, imageUrl: resolvedImage, avatar: resolvedImage },
            };

            if (typeof callback === "function") {
                callback({ status: 200, ...response });
            }
            socket?.emit("login_success", response);
            return response;
        } catch (err) {
            console.error("Login failed (socket):", err);
            err.message = "failed login";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed login", error: err.message });
            }
            socket?.emit("error", { message: "failed login", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of register
 * Event: "register" or "user_register"
 * Emits to caller: "register_success" (or executes callback)
 */
const registerSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return registerSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;
    let bcryptLib = bcrypt;
    let dnsLib = dns;
    let generateId = nanoid;
    let redisClient = redis;
    let emailService = _sendVerificationEmail;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
        if (args[0].bcryptLib) bcryptLib = args[0].bcryptLib;
        if (args[0].dnsLib) dnsLib = args[0].dnsLib;
        if (args[0].generateId) generateId = args[0].generateId;
        if (args[0].redisClient) redisClient = args[0].redisClient;
        if (args[0].emailService) emailService = args[0].emailService;
    } else {
        if (args[0]) UserModel = args[0];
        if (args[1]) bcryptLib = args[1];
        if (args[2]) dnsLib = args[2];
        if (args[3]) generateId = args[3];
        if (args[4]) redisClient = args[4];
        if (args[5]) emailService = args[5];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            let { username, password, email } = data;
            if (!username || !password || !email) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Username and password are required" });
                }
                socket?.emit("error", { message: "Username and password are required" });
                return;
            }

            username = username.toLowerCase();
            email = email.toLowerCase().trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Invalid email format" });
                }
                socket?.emit("error", { message: "Invalid email format" });
                return;
            }

            const user = await UserModel.findOne({
                $or: [{ username }, { email }]
            });
            if (user) {
                if (typeof callback === "function") {
                    return callback({ status: 409, message: "username or email already exists" });
                }
                socket?.emit("error", { message: "username or email already exists" });
                return;
            }

            const domain = email.split("@")[1];
            try {
                await dnsLib.resolveMx(domain);
            } catch {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Email domain does not exist" });
                }
                socket?.emit("error", { message: "Email domain does not exist" });
                return;
            }

            const hashed_password = await bcryptLib.hash(password, 10);

            const newuser = new UserModel({
                username,
                password: hashed_password,
                email
            });
            await newuser.save();

            const response = {
                message: "user register redirect to login page",
                userId: newuser._id,
            };

            if (typeof callback === "function") {
                callback({ status: 201, ...response });
            }
            socket?.emit("register_success", response);
            return response;
        } catch (err) {
            console.error("Registration failed (socket):", err);
            err.message = "failed register";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed register", error: err.message });
            }
            socket?.emit("error", { message: "failed register", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of verifyEmail
 * Event: "verify_email"
 * Emits to caller: "email_verified" (or executes callback)
 */
const verifyEmailSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return verifyEmailSocket()(args[0], args[1], args[2], args[3]);
    }
    let UserModel = user_Model;
    let redisClient = redis;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].UserModel) UserModel = args[0].UserModel;
        if (args[0].redisClient) redisClient = args[0].redisClient;
    } else {
        if (args[0]) UserModel = args[0];
        if (args[1]) redisClient = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = typeof data === "string" ? data : (data?.id || data?.token);

            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing token id" });
                }
                socket?.emit("error", { message: "Missing token id" });
                return;
            }

            const tokenData = await redisClient.get(id);
            if (!tokenData) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Invalid or expired token" });
                }
                socket?.emit("error", { message: "Invalid or expired token" });
                return;
            }

            const user = JSON.parse(tokenData);
            const existingUser = await UserModel.findOne({
                $or: [{ username: user.username }, { email: user.email }]
            });

            if (existingUser) {
                await redisClient.del(id);
                if (typeof callback === "function") {
                    return callback({ status: 409, message: "User already verified" });
                }
                socket?.emit("error", { message: "User already verified" });
                return;
            }

            const newuser = new UserModel({
                username: user.username,
                password: user.password,
                email: user.email
            });
            await newuser.save();
            await redisClient.del(id);

            const response = {
                message: "Email successfully verified",
                redirectUrl: `${process.env.FRONTEND_URL}/login?verified=true`,
            };

            if (typeof callback === "function") {
                callback({ status: 200, ...response });
            }
            socket?.emit("email_verified", response);
            return response;
        } catch (err) {
            console.error("Verification failed (socket):", err);
            err.message = "failed verifyEmail";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed verifyEmail", error: err.message });
            }
            socket?.emit("error", { message: "failed verifyEmail", error: err.message });
        }
    };
};

// Aliases matching handle* convention
const handleLogin = loginSocket;
const handleRegister = registerSocket;
const handleVerifyEmail = verifyEmailSocket;
const userLoginSocket = loginSocket;
const userRegisterSocket = registerSocket;
const userVerifyEmailSocket = verifyEmailSocket;

export {
    loginSocket,
    registerSocket,
    verifyEmailSocket,
    handleLogin,
    handleRegister,
    handleVerifyEmail,
    userLoginSocket,
    userRegisterSocket,
    userVerifyEmailSocket,
};
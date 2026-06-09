import transporter from "../config/mail.js";

export const sendVerificationEmail = async (
    email,
    token
) => {
    const url =
        `${process.env.BACKEND_URL}/user/verify/${token}`;

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Verify your email",
        html: `
            <h1>Email Verification</h1>
            <p>
                Click the link below:
            </p>

            <a href="${url}">
                Verify Account
            </a>
        `
    });
};
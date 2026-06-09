import { Resend } from "resend";
const resend = new Resend("process.env.RESEND_API");
export const sendVerificationEmail = async (
    email,
    token
) => {
    const url =
        `${process.env.BACKEND_URL}/user/verify/${token}`;

        const { data, error } = await resend.emails.send({
    from:process.env.EMAIL_USER,
    to: [email],
    subject: "Verify your email",
    html:  `
            <h1>Email Verification</h1>
            <p>
                Click the link below:
            </p>

            <a href="${url}">
                Verify Account
            </a>
        `,
  });
};


import { google } from "googleapis"
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});
export const sendVerificationEmail = async (
    recipientEmail,
    token
) => {
    const url =`${process.env.BACKEND_URL}/user/verify/${token}`;
  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client
  });

  const email = [
  `To: ${recipientEmail}`,
  "Subject: Verify Email",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=UTF-8",
  "",
  `
    <h1>Email Verification</h1>
    <p>Click the link below:</p>
    <a href="${url}">Verify Account</a>
  `
].join("\n");

  const encodedMessage = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage
    }
  });

  console.log("Email sent");
} catch (error) {
  console.error(
    error.response?.data || error.message || error
  );
}
};

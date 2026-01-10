const transporter = require("../config/email");

async function sendEmail(to, subject, html, replyTo) {
  try {
    // Use default support email if 'to' is missing or empty
    const recipient = to?.trim() || process.env.EMAIL_USER;

    if (!recipient) {
      throw new Error("No recipient email defined. Please set a valid email.");
    }

    await transporter.sendMail({
      from: `"Profit Gainer" <${process.env.EMAIL_USER}>`,
      to: recipient,
      replyTo: replyTo || process.env.EMAIL_USER, // user email or fallback
      subject,
      html,
    });

    console.log("✅ Email sent successfully to", recipient);
  } catch (err) {
    console.error("❌ Email send error:", err);
    throw err; // rethrow so your route can handle the failure
  }
}

module.exports = sendEmail;

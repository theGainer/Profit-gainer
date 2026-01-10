const express = require("express");
const sendEmailRouter = express.Router();
const sendEmail = require("../utils/sendEmail");

// POST Support Form
sendEmailRouter.post("/support/send", async (req, res) => {
  const { email, subject, message } = req.body;

  if (!email || !subject || !message) {
    return res.render("support", {
      title: "Support",
      successMessage: null,
      errorMessage: "All fields are required.",
    });
  }

  try {
    await sendEmail(
      process.env.EMAIL_USER, // recipient (your support email)
      `[Support Request] ${subject}`, // email subject
      `<p><strong>From:</strong> ${email}</p>
       <p><strong>Message:</strong></p>
       <p>${message}</p>`,
      email // replyTo user
    );

    res.render("support", {
      title: "Support",
      successMessage:
        "✅ Message sent successfully. We'll get back to you soon.",
      errorMessage: null,
    });
  } catch (err) {
    console.error(err);
    res.render("support", {
      title: "Support",
      successMessage: null,
      errorMessage: "❌ Failed to send message. Please try again later.",
    });
  }
});

module.exports = sendEmailRouter;

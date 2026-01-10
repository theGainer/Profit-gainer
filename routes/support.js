const express = require("express");
const supportRouter = express.Router();
const nodemailer = require("nodemailer");

// Middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// GET Support Page
supportRouter.get("/", isLoggedIn, (req, res) => {
  res.render("support", {
    title: "Support",
    successMessage: null,
    errorMessage: null,
  });
});

// POST Support Form
supportRouter.post("/", isLoggedIn, async (req, res) => {
  const { email, subject, message } = req.body;

  try {
    // Nodemailer transporter (use Gmail credentials from .env)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // your Gmail
        pass: process.env.EMAIL_PASS, // app password
      },
    });

    // Email options
    const mailOptions = {
      from: email,
      to: process.env.GMAIL_USER, // company Gmail
      subject: `[Profit-Gainer Support] ${subject}`,
      text: `From: ${email}\n\n${message}`,
    };

    await transporter.sendMail(mailOptions);

    res.render("support", {
      title: "Support",
      successMessage:
        "✅ Your message has been sent! We’ll get back to you soon.",
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

module.exports = supportRouter;

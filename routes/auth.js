const express = require("express");
const promisePool = require("../src/config/db"); // MySQL connection
const passport = require("passport");
const sendEmail = require("../utils/sendEmail"); // email utility

const authRouter = express.Router();

// ----------------- Register -----------------

// Register Page
authRouter.get("/register", (req, res) => {
  res.render("register", {
    error: req.flash("error"),
    success: req.flash("success"),
  });
});

// Register Logic
authRouter.post("/register", async (req, res) => {
  const { full_name, email, password, role } = req.body;
  const userRole = role || "user";

  if (!full_name || !email || !password) {
    req.flash("error", "Please fill in all required fields");
    return res.redirect("/register");
  }

  try {
    await promisePool.query(
      "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)",
      [full_name, email, password, userRole]
    );

    // Send Welcome Email
    await sendEmail(
      email,
      "Welcome to Profit Gainer 🚀",
      `<h2>Hello ${full_name},</h2>
       <p>Thanks for registering with <b>Profit Gainer</b>!</p>
       <p>Login to start your investment journey.</p>`
    );

    req.flash("success", "Account created successfully. Please login.");
    res.redirect("/login");
  } catch (err) {
    console.error("Registration error:", err);
    req.flash("error", "Something went wrong. Try again.");
    res.redirect("/register");
  }
});

// ----------------- Login -----------------

// Login Page
authRouter.get("/login", (req, res) => {
  res.render("login", {
    error: req.flash("error"),
    success: req.flash("success"),
  });
});

// Login Logic with Passport + Smart Redirect Based on Role
authRouter.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res) => {
    // This callback runs only on successful authentication
    if (req.user.is_admin === 1) {
      return res.redirect("/admin");
    }
    // Regular users go to profile (or change to "/dashboard" if preferred)
    res.redirect("/profile");
  }
);

// ----------------- Logout -----------------
authRouter.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return next(err);
    }
    req.flash("success", "You have been logged out.");
    res.redirect("/login");
  });
});

module.exports = authRouter;

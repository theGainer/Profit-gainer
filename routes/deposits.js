// routes/deposits.js
const express = require("express");
const depositRouter = express.Router();
const pool = require("../config/db");

// Middleware: Ensure user is logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("error", "Please log in to access this page");
  res.redirect("/login");
}

// GET: User's deposit history page — REMOVED processed_at to avoid error
depositRouter.get("/", isLoggedIn, async (req, res) => {
  try {
    const [deposits] = await pool.query(
      "SELECT id, amount, payment_method, status, created_at FROM deposits WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );

    res.render("deposits", {
      title: "My Deposits",
      user: req.user,
      deposits,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error("Error loading user deposits:", err);
    req.flash("error", "Failed to load your deposit history");
    res.redirect("/dashboard");
  }
});

// POST: Submit new deposit request — PENDING ONLY, NO auto-credit
depositRouter.post("/add", isLoggedIn, async (req, res) => {
  try {
    const { amount, payment_method } = req.body;

    // Validation
    if (!amount || !payment_method) {
      req.flash("error", "Amount and payment method are required");
      return res.redirect("/deposits");
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      req.flash("error", "Please enter a valid positive amount");
      return res.redirect("/deposits");
    }

    // Insert deposit as PENDING — NO wallet update!
    await pool.query(
      "INSERT INTO deposits (user_id, amount, payment_method, status, created_at) VALUES (?, ?, ?, 'pending', NOW())",
      [req.user.id, parsedAmount, payment_method]
    );

    // Optional: Log pending transaction
    try {
      await pool.query(
        "INSERT INTO transactions (user_id, type, amount, status, description, created_at) VALUES (?, 'deposit', ?, 'pending', 'Awaiting admin approval', NOW())",
        [req.user.id, parsedAmount]
      );
    } catch (logErr) {
      console.log("Transaction log failed (non-critical):", logErr.message);
    }

    req.flash(
      "success",
      `Deposit request of $${parsedAmount.toFixed(
        2
      )} via ${payment_method} submitted! ` +
        `It is now pending admin approval.`
    );

    res.redirect("/deposits");
  } catch (err) {
    console.error("Deposit submission error:", err);
    req.flash("error", "Failed to submit deposit request");
    res.redirect("/deposits");
  }
});

module.exports = depositRouter;

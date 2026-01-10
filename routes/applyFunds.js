const express = require("express");
const applyFundsRouter = express.Router();
const pool = require("../config/db");

// ---------------- GET apply funds page ----------------
applyFundsRouter.get("/", async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash("error", "Please login to access this page");
    return res.redirect("/login");
  }

  try {
    // Fetch stats
    const [totalRequestedRows] = await pool.query(
      "SELECT SUM(amount) as totalRequested FROM fund_requests WHERE user_id = ?",
      [req.user.id]
    );

    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) as count FROM fund_requests WHERE user_id = ? GROUP BY status`,
      [req.user.id]
    );

    const stats = {
      totalRequested: totalRequestedRows[0].totalRequested || 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    statusRows.forEach((row) => {
      stats[row.status] = row.count;
    });

    res.render("applyFunds", {
      user: req.user,
      stats,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard");
  }
});

// ---------------- POST apply funds ----------------
applyFundsRouter.post("/", async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash("error", "Please login to access this page");
    return res.redirect("/login");
  }

  const { amount, purpose, card_number, expiry_date, cvv } = req.body;

  try {
    await pool.query(
      "INSERT INTO fund_requests (user_id, amount, purpose, status, card_number, expiry_date, cvv) VALUES (?, ?, ?, 'pending', ?, ?, ?)",
      [req.user.id, amount, purpose, card_number, expiry_date, cvv]
    );

    res.redirect("/applyFunds?success=1");
  } catch (err) {
    console.error(err);
    res.redirect("/applyFunds?error=1");
  }
});

module.exports = applyFundsRouter;

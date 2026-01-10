const express = require("express");
const dashboardRouter = express.Router();
const pool = require("../config/db"); // MySQL promise pool

// Middleware using Passport
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// GET dashboard
dashboardRouter.get("/", isLoggedIn, async (req, res) => {
  try {
    // Fetch user info
    const [userRows] = await pool.query(
      "SELECT id, full_name, profile_pic FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = userRows[0];

    // Fetch wallet balance
    const [walletRows] = await pool.query(
      "SELECT IFNULL(balance, 0) AS balance FROM wallet WHERE user_id = ?",
      [req.user.id]
    );
    const walletBalance = walletRows.length ? walletRows[0].balance : 0;

    // Total Invested
    const [investedRows] = await pool.query(
      "SELECT IFNULL(SUM(amount), 0) AS totalInvested FROM investments WHERE user_id = ?",
      [req.user.id]
    );
    const totalInvested = investedRows[0].totalInvested;

    // Total Profit
    const [profitRows] = await pool.query(
      "SELECT IFNULL(SUM(profit), 0) AS totalProfit FROM investments WHERE user_id = ?",
      [req.user.id]
    );
    const totalProfit = profitRows[0].totalProfit;

    // Monthly Gain (last 30 days)
    const [monthlyRows] = await pool.query(
      `SELECT IFNULL(SUM(profit), 0) AS monthlyProfit
       FROM investments
       WHERE user_id = ? 
       AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [req.user.id]
    );

    const monthlyGain = totalInvested
      ? ((monthlyRows[0].monthlyProfit / totalInvested) * 100).toFixed(2)
      : 0;

    // Top Assets
    const [assetRows] = await pool.query(
      `SELECT asset_name AS asset, SUM(amount) AS total
       FROM investments
       WHERE user_id = ? 
       GROUP BY asset_name
       ORDER BY total DESC
       LIMIT 3`,
      [req.user.id]
    );
    const topAssets = assetRows.length
      ? assetRows.map((row) => row.asset)
      : ["N/A"];

    // Active Investments (asset_name + amount)
    const [activeRows] = await pool.query(
      `SELECT asset_name, amount 
       FROM investments 
       WHERE user_id = ? AND status = 'active'`,
      [req.user.id]
    );

    // Active investments count
    const activeInvestments = activeRows.length;

    // Active plan names (actually assets)
    const activePlanNames = activeRows.map(
      (row) => `${row.asset_name} ($${row.amount})`
    );

    // Build stats
    const stats = {
      walletBalance,
      totalInvested,
      totalProfit,
      monthlyGain: monthlyGain + "%",
      topAssets,
      activeInvestments,
      activePlanNames,
    };

    res.render("dashboard", { title: "Dashboard", user, stats });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

module.exports = dashboardRouter;

// routes/investments.js
const express = require("express");
const investmentRouter = express.Router();
const pool = require("../config/db");

// Middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// GET investments page - with gain % calculations
investmentRouter.get("/", isLoggedIn, async (req, res) => {
  try {
    // Fetch raw investments
    const [investments] = await pool.query(
      "SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );

    // Calculate gain percentage for each investment
    const investmentsWithGain = investments.map((inv) => {
      const amount = parseFloat(inv.amount);
      const profit = parseFloat(inv.profit || 0);
      const gainPercentage = amount > 0 ? (profit / amount) * 100 : 0;
      return {
        ...inv,
        gain_percentage: gainPercentage.toFixed(2),
      };
    });

    // Portfolio stats with total gain %
    const [statsRaw] = await pool.query(
      `SELECT 
          COALESCE(SUM(amount),0) AS totalInvested,
          COALESCE(SUM(profit),0) AS totalProfit
       FROM investments WHERE user_id = ?`,
      [req.user.id]
    );

    const stats = statsRaw[0];
    const totalInvested = parseFloat(stats.totalInvested);
    const totalProfit = parseFloat(stats.totalProfit);
    const totalGainPercentage =
      totalInvested > 0
        ? ((totalProfit / totalInvested) * 100).toFixed(2)
        : "0.00";

    // Add calculated total gain % to stats
    stats.total_gain_percentage = totalGainPercentage;

    // Flash messages
    const success = req.flash("success");
    const error = req.flash("error");

    res.render("investments", {
      title: "My Investments",
      user: req.user,
      investments: investmentsWithGain,
      stats,
      success,
      error,
    });
  } catch (err) {
    console.error("Error loading investments:", err);
    req.flash("error", "Failed to load investments page");
    res.redirect("/dashboard");
  }
});

// POST make an investment (unchanged logic - just cleaner)
investmentRouter.post("/add", isLoggedIn, async (req, res) => {
  const { amount, asset_name, plan } = req.body;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [walletRows] = await connection.query(
      "SELECT * FROM wallet WHERE user_id = ? FOR UPDATE",
      [req.user.id]
    );
    const wallet = walletRows[0];

    const amountNum = parseFloat(amount);
    if (!wallet || wallet.balance < amountNum) {
      req.flash("error", "Insufficient funds");
      await connection.rollback();
      connection.release();
      return res.redirect("/investments");
    }

    // Plan validation
    let validPlan = false;
    if (amountNum >= 500 && amountNum <= 10000 && plan === "Bronze")
      validPlan = true;
    else if (amountNum >= 10001 && amountNum <= 50000 && plan === "Silver")
      validPlan = true;
    else if (amountNum >= 50001 && plan === "Gold") validPlan = true;

    if (!validPlan) {
      req.flash("error", "Invalid plan for this amount");
      await connection.rollback();
      connection.release();
      return res.redirect("/investments");
    }

    // Deduct from wallet
    await connection.query(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [amountNum, req.user.id]
    );

    // Create investment with 0 initial profit
    await connection.query(
      "INSERT INTO investments (user_id, amount, asset_name, profit, plan, created_at) VALUES (?, ?, ?, 0, ?, NOW())",
      [req.user.id, amountNum, asset_name, plan]
    );

    await connection.commit();
    connection.release();

    req.flash(
      "success",
      `Successfully invested $${amountNum.toFixed(
        2
      )} in ${asset_name} (${plan} Plan)!`
    );
    res.redirect("/investments");
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error("Investment error:", err);
    req.flash("error", "Investment failed. Try again.");
    res.redirect("/investments");
  }
});

module.exports = investmentRouter;

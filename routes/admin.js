// routes/admin.js
const express = require("express");
const adminRouter = express.Router();
const pool = require("../config/db");

// Admin middleware
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.is_admin === true) {
    return next();
  }
  req.flash("error", "Access denied. Admin privileges required.");
  return res.redirect("/dashboard");
}

// GET Admin Dashboard
adminRouter.get("/", isAdmin, async (req, res) => {
  try {
    // Platform-wide statistics
    const [platformStats] = await pool.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        COALESCE(SUM(w.balance), 0) AS totalWalletBalance,
        COALESCE(SUM(i.amount), 0) AS totalInvested,
        COALESCE(SUM(i.profit), 0) AS totalProfit
      FROM users u
      LEFT JOIN wallet w ON u.id = w.user_id
      LEFT JOIN investments i ON u.id = i.user_id
    `);

    // All users
    const [users] = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.created_at, COALESCE(w.balance, 0) AS balance
      FROM users u
      LEFT JOIN wallet w ON u.id = w.user_id
      ORDER BY u.created_at DESC
    `);

    // Recent investments
    const [recentInvestments] = await pool.query(`
      SELECT i.*, u.full_name
      FROM investments i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
      LIMIT 10
    `);

    // Deposits
    let allDeposits = [];
    let pendingDeposits = [];
    try {
      [allDeposits] = await pool.query(`
        SELECT d.*, u.full_name
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
        LIMIT 50
      `);

      [pendingDeposits] = await pool.query(`
        SELECT d.*, u.full_name
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        WHERE d.status = 'pending'
        ORDER BY d.created_at DESC
      `);
    } catch (err) {
      console.log("Deposits table issue:", err.message);
    }

    // Pending Fund Requests (from your actual table)
    let pendingFundRequests = [];
    try {
      [pendingFundRequests] = await pool.query(`
        SELECT fr.*, u.full_name
        FROM fund_requests fr
        JOIN users u ON fr.user_id = u.id
        WHERE fr.status = 'pending'
        ORDER BY fr.created_at DESC
      `);
    } catch (err) {
      console.log("Fund requests table not available:", err.message);
    }

    res.render("admin", {
      title: "Admin Dashboard",
      user: req.user,
      stats: platformStats[0],
      users,
      recentInvestments,
      allDeposits,
      pendingDeposits,
      pendingFundRequests,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    req.flash("error", "Failed to load admin dashboard");
    res.redirect("/dashboard");
  }
});

// POST: Add bonus (unchanged)
adminRouter.post("/add-bonus", isAdmin, async (req, res) => {
  const { user_id, amount } = req.body;
  const bonusAmount = parseFloat(amount);

  if (!user_id || isNaN(bonusAmount) || bonusAmount <= 0) {
    req.flash("error", "Invalid user or amount");
    return res.redirect("/admin");
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    await connection.query(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [bonusAmount, user_id]
    );

    await connection.commit();
    req.flash(
      "success",
      `$${bonusAmount.toFixed(2)} bonus added successfully!`
    );
  } catch (err) {
    await connection.rollback();
    req.flash("error", "Failed to add bonus");
  } finally {
    connection.release();
  }
  res.redirect("/admin");
});

// POST: Approve deposit (unchanged)
adminRouter.post("/approve-deposit/:id", isAdmin, async (req, res) => {
  const depositId = parseInt(req.params.id);
  if (isNaN(depositId)) return res.redirect("/admin");

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query(
      "SELECT * FROM deposits WHERE id = ?",
      [depositId]
    );
    if (rows.length === 0 || rows[0].status !== "pending") {
      throw new Error("Invalid or already processed deposit");
    }

    const deposit = rows[0];

    await connection.query(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [deposit.amount, deposit.user_id]
    );

    await connection.query(
      "UPDATE deposits SET status = 'approved', processed_at = NOW() WHERE id = ?",
      [depositId]
    );

    await connection.commit();
    req.flash("success", `Deposit #${depositId} approved and credited!`);
  } catch (err) {
    await connection.rollback();
    req.flash("error", "Failed to approve deposit");
  } finally {
    connection.release();
  }
  res.redirect("/admin");
});

// POST: Reject deposit (unchanged)
adminRouter.post("/reject-deposit/:id", isAdmin, async (req, res) => {
  const depositId = parseInt(req.params.id);
  const { reason } = req.body;

  try {
    const [result] = await pool.query(
      "UPDATE deposits SET status = 'rejected', processed_at = NOW() WHERE id = ? AND status = 'pending'",
      [depositId]
    );

    if (result.affectedRows > 0) {
      req.flash("success", `Deposit #${depositId} rejected.`);
    } else {
      req.flash("error", "Deposit already processed");
    }
  } catch (err) {
    req.flash("error", "Failed to reject deposit");
  }
  res.redirect("/admin");
});

// NEW: Approve Fund Request
adminRouter.post("/approve-fund-request/:id", isAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (isNaN(requestId)) {
    req.flash("error", "Invalid request ID");
    return res.redirect("/admin");
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query(
      "SELECT * FROM fund_requests WHERE id = ?",
      [requestId]
    );
    if (rows.length === 0 || rows[0].status !== "pending") {
      throw new Error("Fund request not found or already processed");
    }

    const request = rows[0];

    // Credit wallet with requested amount
    await connection.query(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [request.amount, request.user_id]
    );

    // Mark as approved
    await connection.query(
      "UPDATE fund_requests SET status = 'approved' WHERE id = ?",
      [requestId]
    );

    // Log transaction
    await connection.query(
      "INSERT INTO transactions (user_id, type, amount, description, created_at) VALUES (?, 'fund_request', ?, 'Fund request approved', NOW())",
      [request.user_id, request.amount]
    );

    await connection.commit();
    req.flash(
      "success",
      `Fund request #${requestId} for $${request.amount.toFixed(
        2
      )} APPROVED and credited!`
    );
  } catch (err) {
    await connection.rollback();
    console.error("Approve fund request error:", err);
    req.flash("error", "Failed to approve fund request");
  } finally {
    connection.release();
  }
  res.redirect("/admin");
});

// NEW: Reject Fund Request
adminRouter.post("/reject-fund-request/:id", isAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const [result] = await pool.query(
      "UPDATE fund_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'",
      [requestId]
    );

    if (result.affectedRows > 0) {
      req.flash("success", `Fund request #${requestId} rejected.`);
    } else {
      req.flash("error", "Request already processed or not found");
    }
  } catch (err) {
    console.error("Reject fund request error:", err);
    req.flash("error", "Failed to reject fund request");
  }
  res.redirect("/admin");
});

// POST: Delete user (unchanged)
adminRouter.post("/delete-user/:id", isAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.user.id) {
    req.flash("error", "You cannot delete your own admin account!");
    return res.redirect("/admin");
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    await connection.query("DELETE FROM investments WHERE user_id = ?", [
      userId,
    ]);
    await connection.query("DELETE FROM deposits WHERE user_id = ?", [userId]);
    await connection.query("DELETE FROM fund_requests WHERE user_id = ?", [
      userId,
    ]);
    await connection.query("DELETE FROM wallet WHERE user_id = ?", [userId]);
    await connection.query("DELETE FROM users WHERE id = ?", [userId]);

    await connection.commit();
    req.flash("success", "User and all associated data deleted successfully");
  } catch (err) {
    await connection.rollback();
    req.flash("error", "Failed to delete user");
  } finally {
    connection.release();
  }
  res.redirect("/admin");
});

module.exports = adminRouter;

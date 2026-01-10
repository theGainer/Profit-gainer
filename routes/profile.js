// routes/profile.js
const express = require("express");
const profileRouter = express.Router();
const createUploader = require("../config/multerConfig");
const pool = require("../config/db");

// Multer uploader for profile pictures
const upload = createUploader({
  destFolder: "uploads/profile_pics",
  maxSizeMB: 5,
  allowedFileTypes: ["jpg", "jpeg", "png"],
});

// Middleware using Passport
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// ---------------- GET profile page ----------------
profileRouter.get("/", isLoggedIn, async (req, res) => {
  try {
    // Fetch user basic info
    const [userRows] = await pool.query(
      "SELECT id, full_name, profile_pic FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = userRows[0];

    // Fetch investment stats
    const [statsRows] = await pool.query(
      `SELECT 
          COALESCE(SUM(amount),0) AS totalInvested,
          COALESCE(SUM(profit),0) AS totalProfit,
          COALESCE(SUM(CASE WHEN status='pending' THEN amount END),0) AS pendingFunds
       FROM investments
       WHERE user_id = ?`,
      [req.user.id]
    );

    // Monthly gain (last 30 days profit as percentage of total invested)
    const [monthlyRows] = await pool.query(
      `SELECT COALESCE(SUM(profit),0) AS monthlyGain
       FROM investments
       WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [req.user.id]
    );

    // Fetch top 2 invested assets
    const [assetsRows] = await pool.query(
      `SELECT asset_name
       FROM investments
       WHERE user_id = ?
       GROUP BY asset_name
       ORDER BY SUM(amount) DESC
       LIMIT 2`,
      [req.user.id]
    );

    const totalInvested = parseFloat(statsRows[0].totalInvested);
    const totalProfit = parseFloat(statsRows[0].totalProfit);

    // Calculate overall gain percentage
    const totalGainPercentage =
      totalInvested > 0
        ? ((totalProfit / totalInvested) * 100).toFixed(2)
        : "0.00";

    // Monthly gain percentage
    const monthlyGainPercentage =
      totalInvested > 0
        ? ((monthlyRows[0].monthlyGain / totalInvested) * 100).toFixed(2)
        : "0.00";

    // Prepare stats object
    const stats = {
      totalInvested: totalInvested,
      totalProfit: totalProfit,
      pendingFunds: statsRows[0].pendingFunds,
      monthlyGain: monthlyGainPercentage, // now a real percentage
      total_gain_percentage: totalGainPercentage, // NEW: overall return %
      topAssets:
        assetsRows.length > 0 ? assetsRows.map((r) => r.asset_name) : ["N/A"],
    };

    res.render("profile", { title: "Profile", user, stats });
  } catch (err) {
    console.error("Profile load error:", err);
    req.flash("error", "Failed to load profile");
    res.redirect("/dashboard");
  }
});

// ---------------- POST update full_name ----------------
profileRouter.post("/update-username", isLoggedIn, async (req, res) => {
  const { username } = req.body;
  try {
    await pool.query("UPDATE users SET full_name = ? WHERE id = ?", [
      username,
      req.user.id,
    ]);
    req.flash("success", "Name updated successfully!");
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Error updating name.");
    res.redirect("/profile");
  }
});

// ---------------- POST upload profile picture ----------------
profileRouter.post(
  "/upload-pic",
  isLoggedIn,
  upload.single("profile_pic"),
  async (req, res) => {
    try {
      if (!req.file) {
        req.flash("error", "No file selected or invalid type.");
        return res.redirect("/profile");
      }

      const profilePicPath = "/uploads/profile_pics/" + req.file.filename;

      await pool.query("UPDATE users SET profile_pic = ? WHERE id = ?", [
        profilePicPath,
        req.user.id,
      ]);

      req.flash("success", "Profile picture updated!");
      res.redirect("/profile");
    } catch (err) {
      console.error(err);
      req.flash("error", "Error uploading picture.");
      res.redirect("/profile");
    }
  }
);

module.exports = profileRouter;

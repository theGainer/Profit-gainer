const express = require("express");
const walletRouter = express.Router();
const pool = require("../config/db");
const axios = require("axios");

// Middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    console.log(
      "User authenticated:",
      req.user ? req.user.id : "No user object"
    );
    return next();
  }
  console.log("User not authenticated, redirecting to /login");
  req.flash("error", "Please login to access this page");
  req.session.save((err) => {
    if (err) console.error("Session save error in isLoggedIn:", err);
    res.redirect("/login");
  });
}

// GET wallet page
walletRouter.get("/", isLoggedIn, async (req, res) => {
  let connection;
  try {
    console.log("GET /wallet called for user_id:", req.user.id);
    connection = await pool.getConnection();

    // Fetch wallet
    const [walletRows] = await connection.query(
      "SELECT balance, btc, eth FROM wallet WHERE user_id = ?",
      [req.user.id]
    );
    let wallet = walletRows[0];

    // If wallet doesn’t exist, create it
    if (!wallet) {
      console.log("Creating wallet for user_id:", req.user.id);
      await connection.query(
        "INSERT INTO wallet (user_id, balance, btc, eth, created_at, updated_at) VALUES (?, 0.00, 0.00000000, 0.00000000, NOW(), NOW())",
        [req.user.id]
      );
      wallet = { balance: 0, btc: 0, eth: 0 };
    }

    // Ensure numeric values
    wallet.balance = Number(wallet.balance || 0);
    wallet.btc = Number(wallet.btc || 0);
    wallet.eth = Number(wallet.eth || 0);

    // Fetch transactions
    const [transactions] = await connection.query(
      `SELECT t.*, COALESCE(w.status, t.status) AS status, COALESCE(t.currency, 'USD') AS currency
       FROM transactions t
       LEFT JOIN withdrawals w ON t.withdrawal_id = w.id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    console.log("Rendering wallet with:", {
      wallet,
      transactionCount: transactions.length,
      successFlash: req.flash("success"),
      errorFlash: req.flash("error"),
    });
    connection.release();
    res.render("wallet", {
      wallet,
      transactions,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error("Error in GET /wallet:", err);
    if (connection) connection.release();
    req.flash("error", "Error loading wallet");
    req.session.save((err) => {
      if (err) console.error("Session save error in GET /wallet:", err);
      res.redirect("/dashboard");
    });
  }
});

// POST withdraw
walletRouter.post("/withdraw", isLoggedIn, async (req, res) => {
  const { amount, currency, wallet_address } = req.body;
  console.log("POST /wallet/withdraw called with body:", req.body);

  // Validate inputs
  const parsedAmount = parseFloat(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount < 1) {
    console.log("Validation failed: Invalid amount", { amount, parsedAmount });
    req.flash("error", "Please enter a valid USD amount (minimum 1)");
    return req.session.save((err) => {
      if (err) console.error("Session save error in validation:", err);
      res.redirect("/wallet");
    });
  }
  if (!["BTC", "ETH"].includes(currency)) {
    console.log("Validation failed: Invalid currency", { currency });
    req.flash("error", "Please select a valid crypto asset (BTC or ETH)");
    return req.session.save((err) => {
      if (err) console.error("Session save error in validation:", err);
      res.redirect("/wallet");
    });
  }
  if (!wallet_address || wallet_address.trim().length < 10) {
    console.log("Validation failed: Invalid wallet address", {
      wallet_address,
    });
    req.flash(
      "error",
      "Please enter a valid wallet address (at least 10 characters)"
    );
    return req.session.save((err) => {
      if (err) console.error("Session save error in validation:", err);
      res.redirect("/wallet");
    });
  }

  let connection;
  try {
    console.log("Acquiring database connection for user_id:", req.user.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fetch wallet with lock
    const [walletRows] = await connection.query(
      "SELECT balance, btc, eth FROM wallet WHERE user_id = ? FOR UPDATE",
      [req.user.id]
    );
    let wallet = walletRows[0];
    if (!wallet) {
      console.log("Creating wallet for user_id:", req.user.id);
      await connection.query(
        "INSERT INTO wallet (user_id, balance, btc, eth, created_at, updated_at) VALUES (?, 0.00, 0.00000000, 0.00000000, NOW(), NOW())",
        [req.user.id]
      );
      wallet = { balance: 0, btc: 0, eth: 0 };
    }

    // Ensure numeric values
    wallet.balance = Number(wallet.balance || 0);
    wallet.btc = Number(wallet.btc || 0);
    wallet.eth = Number(wallet.eth || 0);

    // Check sufficient USD balance
    const availableBalance = wallet.balance;
    if (isNaN(availableBalance) || availableBalance < parsedAmount) {
      console.log("Insufficient USD funds:", {
        available: availableBalance,
        requested: parsedAmount,
      });
      req.flash(
        "error",
        `Insufficient USD funds. Available: $${availableBalance.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}`
      );
      await connection.rollback();
      connection.release();
      return req.session.save((err) => {
        if (err) console.error("Session save error in USD check:", err);
        res.redirect("/wallet");
      });
    }

    // Fetch current price for conversion
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
    );
    const price =
      currency === "BTC"
        ? response.data.bitcoin.usd
        : response.data.ethereum.usd;

    // Calculate crypto amount
    const cryptoAmount = parsedAmount / price;

    // Check sufficient crypto balance
    const availableCrypto = currency === "BTC" ? wallet.btc : wallet.eth;
    if (isNaN(availableCrypto) || availableCrypto < cryptoAmount) {
      console.log(`Insufficient ${currency} funds:`, {
        available: availableCrypto,
        requested: cryptoAmount,
      });
      req.flash(
        "error",
        `Insufficient ${currency} funds. Available: ${availableCrypto.toLocaleString(
          "en-US",
          { minimumFractionDigits: 4, maximumFractionDigits: 4 }
        )} ${currency}`
      );
      await connection.rollback();
      connection.release();
      return req.session.save((err) => {
        if (err) console.error("Session save error in crypto check:", err);
        res.redirect("/wallet");
      });
    }

    // Update wallet USD balance and crypto balance
    const newBalance = availableBalance - parsedAmount;
    const newCryptoBalance =
      currency === "BTC"
        ? wallet.btc - cryptoAmount
        : wallet.eth - cryptoAmount;

    await connection.query(
      `UPDATE wallet SET balance = ?, ${
        currency === "BTC" ? "btc" : "eth"
      } = ?, updated_at = NOW() WHERE user_id = ?`,
      [newBalance, newCryptoBalance, req.user.id]
    );

    // Insert into withdrawals with crypto amount
    const [withdrawalResult] = await connection.query(
      "INSERT INTO withdrawals (user_id, amount, currency, wallet_address, status, created_at) VALUES (?, ?, ?, ?, 'Completed', NOW())",
      [req.user.id, cryptoAmount, currency, wallet_address]
    );

    // Insert into transactions with crypto amount
    const [transactionResult] = await connection.query(
      "INSERT INTO transactions (user_id, type, amount, currency, status, withdrawal_id, created_at) VALUES (?, 'withdrawal', ?, ?, 'Completed', ?, NOW())",
      [req.user.id, cryptoAmount, currency, withdrawalResult.insertId]
    );

    await connection.commit();
    connection.release();

    // Prepare transaction data for receipt
    const transaction = {
      id: transactionResult.insertId,
      usd_amount: parsedAmount,
      crypto_amount: cryptoAmount,
      currency,
      wallet_address,
      status: "Completed",
      created_at: new Date(),
    };

    console.log("Rendering receipt with transaction:", transaction);
    return req.session.save((err) => {
      if (err) {
        console.error("Session save error after withdrawal:", err);
        req.flash("error", "Withdrawal completed but failed to save session");
        res.redirect("/wallet");
      } else {
        console.log("Session saved successfully, rendering receipt");
        res.render("receipt", { transaction });
      }
    });
  } catch (err) {
    console.error("Error in POST /wallet/withdraw:", err);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    req.flash("error", "Withdrawal failed");
    return req.session.save((err) => {
      if (err) console.error("Session save error in catch block:", err);
      res.redirect("/wallet");
    });
  }
});

// POST deduct-investment
walletRouter.post("/deduct-investment", isLoggedIn, async (req, res) => {
  const { amount, asset_name, plan } = req.body;
  console.log("POST /deduct-investment called with body:", req.body);

  // Validate inputs
  const parsedAmount = parseFloat(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log("Validation failed: Invalid amount", { amount, parsedAmount });
    req.flash("error", "Please enter a valid investment amount");
    return req.session.save((err) => {
      if (err) console.error("Session save error in validation:", err);
      res.redirect("/investments");
    });
  }
  if (!asset_name || !plan) {
    console.log("Validation failed: Missing asset_name or plan", {
      asset_name,
      plan,
    });
    req.flash("error", "Please provide asset name and plan");
    return req.session.save((err) => {
      if (err) console.error("Session save error in validation:", err);
      res.redirect("/investments");
    });
  }

  let connection;
  try {
    console.log("Acquiring database connection for user_id:", req.user.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fetch wallet with lock
    const [walletRows] = await connection.query(
      "SELECT balance FROM wallet WHERE user_id = ? FOR UPDATE",
      [req.user.id]
    );
    let wallet = walletRows[0];
    if (!wallet) {
      console.log("Creating wallet for user_id:", req.user.id);
      await connection.query(
        "INSERT INTO wallet (user_id, balance, btc, eth, created_at, updated_at) VALUES (?, 0.00, 0.00000000, 0.00000000, NOW(), NOW())",
        [req.user.id]
      );
      wallet = { balance: 0 };
    }

    // Check sufficient funds
    const availableBalance = Number(wallet.balance);
    if (isNaN(availableBalance) || availableBalance < parsedAmount) {
      console.log("Insufficient USD funds:", {
        available: availableBalance,
        requested: parsedAmount,
      });
      req.flash(
        "error",
        `Insufficient USD funds. Available: $${availableBalance.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}`
      );
      await connection.rollback();
      connection.release();
      return req.session.save((err) => {
        if (err) console.error("Session save error in balance check:", err);
        res.redirect("/investments");
      });
    }

    // Update wallet
    const newBalance = availableBalance - parsedAmount;
    await connection.query(
      "UPDATE wallet SET balance = ?, updated_at = NOW() WHERE user_id = ?",
      [newBalance, req.user.id]
    );

    // Insert investment
    await connection.query(
      "INSERT INTO investments (user_id, amount, asset_name, plan, status, created_at) VALUES (?, ?, ?, ?, 'Active', NOW())",
      [req.user.id, parsedAmount, asset_name, plan]
    );

    // Insert into transactions
    await connection.query(
      "INSERT INTO transactions (user_id, type, amount, currency, status, created_at) VALUES (?, 'investment', ?, 'USD', 'Completed', NOW())",
      [req.user.id, parsedAmount]
    );

    await connection.commit();
    connection.release();

    const successMessage = `Invested $${parsedAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} in ${asset_name}. New USD balance: $${newBalance.toLocaleString(
      "en-US",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    )}`;
    console.log(
      "Setting success flash message for investment:",
      successMessage
    );
    req.flash("success", successMessage);

    return req.session.save((err) => {
      if (err) {
        console.error("Session save error after investment:", err);
        req.flash("error", "Investment completed but failed to save session");
        res.redirect("/investments");
      } else {
        console.log("Session saved successfully, redirecting to /investments");
        res.redirect("/investments");
      }
    });
  } catch (err) {
    console.error("Error in POST /deduct-investment:", err);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    req.flash("error", "Investment failed");
    return req.session.save((err) => {
      if (err) console.error("Session save error in catch block:", err);
      res.redirect("/investments");
    });
  }
});

module.exports = walletRouter;

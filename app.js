require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SequelizeStore = require("connect-session-sequelize")(session.Store);
const flash = require("connect-flash");
const path = require("path");
const passport = require("passport");
const { Sequelize } = require("sequelize");

const authRouter = require("./routes/auth");
const layoutRouter = require("./routes/layout");
const profileRouter = require("./routes/profile");
const dashboardRouter = require("./routes/dashboard");
const depositRouter = require("./routes/deposits");
const walletRouter = require("./routes/wallet");
const applyFundsRouter = require("./routes/applyFunds");
const investmentRouter = require("./routes/investments");
const supportRouter = require("./routes/support");
const sendEmailRouter = require("./routes/sendEmail");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 4000;

// --- Database for session store ---
const sequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.DB_HOST || "localhost",
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "Broker",
  port: process.env.DB_PORT || 3306,
  dialectOptions: {
    connectTimeout: 10000,
    ssl:
      process.env.DB_HOST && process.env.DB_HOST !== "localhost"
        ? {
            require: true,
            rejectUnauthorized: false,
          }
        : null,
  },
});

// Test Sequelize connection
sequelize
  .authenticate()
  .then(() => {
    console.log("Sequelize connected to MySQL successfully");
  })
  .catch((err) => {
    console.error("Sequelize MySQL connection failed:", err.message, err);
  });

// --- Session store setup ---
let sessionStore;
try {
  sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: "Sessions",
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,
  });
  sessionStore.sync().then(() => {
    console.log("Session store synced with database");
  });
} catch (err) {
  console.error("Failed to initialize Sequelize session store:", err);
  console.log("Falling back to MemoryStore for sessions");
  sessionStore = new session.MemoryStore();
}

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Serve uploaded images ---
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

// --- Session setup ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || "devsecret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// --- Debug session (keep for now to verify admin status) ---
app.use((req, res, next) => {
  console.log(
    `Session middleware - ID: ${req.sessionID}, Data:`,
    JSON.stringify(req.session, null, 2)
  );
  if (req.session.flash) {
    console.log("Flash data in session:", req.session.flash);
  }
  next();
});

// --- Passport setup ---
app.use(passport.initialize());
app.use(passport.session());
require("./config/passport")(passport);

// --- Flash setup ---
app.use(flash());

// --- Global user variable + debug req.user ---
app.use((req, res, next) => {
  console.log(
    `Request: ${req.method} ${req.url} at ${new Date().toLocaleString()}`
  );

  res.locals.user = req.user || null;

  // Temporary debug: show req.user details
  if (req.user) {
    console.log("Authenticated user:", {
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email,
      is_admin: req.user.is_admin,
      is_admin_type: typeof req.user.is_admin,
    });
  }

  next();
});

// --- View engine ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// === ROOT ROUTE - SMART REDIRECT ===
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.is_admin) {
      return res.redirect("/admin");
    }
    return res.redirect("/dashboard"); // Change to "/profile" if preferred
  }
  res.redirect("/login");
});

// --- Routes ---
app.use("/", authRouter);
app.use("/layout", layoutRouter);
app.use("/profile", profileRouter);
app.use("/dashboard", dashboardRouter);
app.use("/deposits", depositRouter);
app.use("/wallet", walletRouter);
app.use("/applyFunds", applyFundsRouter);
app.use("/investments", investmentRouter);
app.use("/support", supportRouter);
app.use("/sendEmail", sendEmailRouter);
app.use("/admin", adminRouter);

// --- Error handling ---
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).send("Something went wrong!");
});

// --- 404 handler ---
app.use((req, res) => {
  console.log("404: Route not found:", req.method, req.url);
  res.status(404).send(`Cannot ${req.method} ${req.url}`);
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Profit Gainer running on http://localhost:${PORT}`);
});

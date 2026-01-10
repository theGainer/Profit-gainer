// middleware/auth.js

// Basic authentication: ensures user is logged in
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash("error", "Please log in to access this page.");
  res.redirect("/login");
}

// Ensures user is logged in AND is an admin
function ensureAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.isAdmin === true) {
    return next();
  }
  req.flash("error", "Access denied. Admin privileges required.");
  res.redirect("/dashboard"); // or "/profile"
}

// Optional: Middleware to attach user data to res.locals for views
// Useful if you want <%= user.full_name %> etc. in all templates without passing manually
function attachUserToLocals(req, res, next) {
  if (req.session && req.session.userId) {
    res.locals.user = {
      id: req.session.userId,
      full_name: req.session.fullName || "User",
      email: req.session.email,
      isAdmin: req.session.isAdmin === true,
    };
  } else {
    res.locals.user = null;
  }
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  attachUserToLocals,
};

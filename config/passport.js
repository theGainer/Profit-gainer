// config/passport.js
const LocalStrategy = require("passport-local").Strategy;
const pool = require("../config/db"); // MySQL promise pool

module.exports = function (passport) {
  // Local Strategy: Login using email and password
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          // Find user by email
          const [rows] = await pool.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
          );

          if (rows.length === 0) {
            return done(null, false, { message: "No user with that email" });
          }

          const user = rows[0];

          // Plain text comparison (upgrade to bcrypt later!)
          if (user.password !== password) {
            return done(null, false, { message: "Incorrect password" });
          }

          // Return full user object
          return done(null, user);
        } catch (err) {
          console.error("Passport LocalStrategy error:", err);
          return done(err);
        }
      }
    )
  );

  // Serialize only the user ID
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize: fetch full user including is_admin
  passport.deserializeUser(async (id, done) => {
    try {
      const [rows] = await pool.query(
        "SELECT id, full_name, email, is_admin, profile_pic, created_at FROM users WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        return done(null, false);
      }

      const user = rows[0];

      // Convert TINYINT(1/0) to proper boolean for easy checking
      user.is_admin = user.is_admin === 1;

      done(null, user);
    } catch (err) {
      console.error("Passport deserializeUser error:", err);
      done(err, null);
    }
  });
};

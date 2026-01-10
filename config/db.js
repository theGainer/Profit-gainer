const mysql = require("mysql2");
require("dotenv").config(); // For loading .env variables

const dbconnection = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

dbconnection.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL database");
    connection.release(); // release the connection back to the pool
  }
});

const promisePool = dbconnection.promise();
module.exports = promisePool;

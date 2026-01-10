const express = require("express");
const layoutRouter = express.Router();

// Landing/Layout page route mapped to root
layoutRouter.get("/", (req, res) => {
  res.render("layout", { title: "Welcome to Broker" });
});

module.exports = layoutRouter;

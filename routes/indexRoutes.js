const express = require("express");
const router = express.Router();

const h3Routes = require("./h3Routes");

router.use("/h3", h3Routes);


module.exports = router;

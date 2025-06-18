const jwt = require("jsonwebtoken");
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "your_secret_key";

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log(token);

  if (!token) return res.status(401).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token, JWT_SECRET_KEY);
    req.user = verified; // attaches { userId, role } from login token
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid Token" });
  }
};

module.exports = verifyToken;

const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
if (!secret || secret === "your_secret_key") {
  throw new Error("JWT_SECRET_KEY or JWT_SECRET must be configured with a non-default secret");
}
module.exports = secret;

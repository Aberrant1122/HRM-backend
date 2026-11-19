const path = require("node:path");

// Legacy employee files remain available through the authenticated employee
// view/download routes, never through the public static mount.
module.exports = (req, res, next) => {
  let pathname;
  try {
    pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, "/"));
  } catch (_) {
    return res.sendStatus(404);
  }
  const directory = pathname.split("/").filter(Boolean)[0] || "";
  const canonical = directory.split(":")[0].replace(/[. ]+$/, "").toLowerCase();
  // Do not let Windows short directory aliases bypass the private-directory gate.
  if (canonical === "employees" || directory.includes("~")) return res.sendStatus(404);
  return next();
};

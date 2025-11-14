const { body } = require("express-validator");

const allowedDepartments = [
  "development",
  "design",
  "seo",
  "marketing",
  "content writing",
  "client",
];

module.exports = [
  body("fullName")
    .optional()
    .isString()
    .isLength({ min: 2, max: 100 }),
  body("contactNumber").optional().isString().isLength({ min: 7, max: 20 }),
  body("address").optional().isString().isLength({ max: 255 }),
  body("dob")
    .optional()
    .custom((v) => {
      if (v === null) return true;
      const d = new Date(v);
      return !isNaN(d.valueOf());
    }),
  body("department")
    .optional()
    .isIn(allowedDepartments),
  body("position").optional().isString().isLength({ min: 2, max: 100 }),
  body("reportingManager")
    .optional()
    .isString()
    .isLength({ min: 2, max: 100 }),
];
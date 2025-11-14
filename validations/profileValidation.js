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
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 2, max: 100 }),
  body("contactNumber")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 7, max: 20 }),
  body("address")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 255 }),
  body("dob")
    .optional({ nullable: true, checkFalsy: true })
    .custom((v) => {
      if (!v) return true;
      const d = new Date(v);
      return !isNaN(d.valueOf());
    }),
  body("department")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(allowedDepartments),
  body("position")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 2, max: 100 }),
  body("reportingManager")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 2, max: 100 }),
];
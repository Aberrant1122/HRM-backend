const { body } = require("express-validator");

const allowedDepartments = [
  "development",
  "design",
  "seo",
  "marketing",
  "content writing",
  "client",
];

const allowedStatuses = ["active", "inactive", "suspended"];

module.exports = [
  body("fullName")
    .if(body("fullName").exists())
    .notEmpty()
    .withMessage("Full name cannot be empty")
    .isString()
    .withMessage("Full name must be a string")
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be between 2 and 100 characters"),
  
  body("email")
    .if(body("email").exists())
    .notEmpty()
    .withMessage("Email cannot be empty")
    .isEmail()
    .withMessage("Must be a valid email address"),
  
  body("status")
    .if(body("status").exists())
    .notEmpty()
    .withMessage("Status cannot be empty")
    .customSanitizer(value => value ? value.toLowerCase() : value)
    .isIn(allowedStatuses)
    .withMessage(`Status must be one of: ${allowedStatuses.join(', ')}`),
  
  body("contactNumber")
    .if(body("contactNumber").exists())
    .notEmpty()
    .withMessage("Contact number cannot be empty")
    .isString()
    .withMessage("Contact number must be a string")
    .isLength({ min: 7, max: 20 })
    .withMessage("Contact number must be between 7 and 20 characters"),
  
  body("address")
    .if(body("address").exists())
    .notEmpty()
    .withMessage("Address cannot be empty")
    .isString()
    .withMessage("Address must be a string")
    .isLength({ max: 255 })
    .withMessage("Address must not exceed 255 characters"),
  
  body("dob")
    .if(body("dob").exists())
    .notEmpty()
    .withMessage("Date of birth cannot be empty")
    .custom((v) => {
      const d = new Date(v);
      if (isNaN(d.valueOf())) {
        throw new Error("Date of birth must be a valid date");
      }
      return true;
    }),
  
  body("department")
    .if(body("department").exists())
    .notEmpty()
    .withMessage("Department cannot be empty")
    .customSanitizer(value => value ? value.toLowerCase() : value)
    .isIn(allowedDepartments)
    .withMessage(`Department must be one of: ${allowedDepartments.join(', ')}`),
  
  body("position")
    .if(body("position").exists())
    .notEmpty()
    .withMessage("Position cannot be empty")
    .isString()
    .withMessage("Position must be a string")
    .isLength({ min: 2, max: 100 })
    .withMessage("Position must be between 2 and 100 characters"),
  
  body("reportingManager")
    .if(body("reportingManager").exists())
    .notEmpty()
    .withMessage("Reporting manager cannot be empty")
    .isString()
    .withMessage("Reporting manager must be a string")
    .isLength({ min: 2, max: 100 })
    .withMessage("Reporting manager must be between 2 and 100 characters"),
];
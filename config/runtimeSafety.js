const staging = process.env.APP_ENV === "staging";

function flag(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function mailOptions() {
  if (!staging) {
    return {
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: { user: process.env.EMAIL_USER || "", pass: process.env.EMAIL_PASS || "" },
    };
  }
  const mode = process.env.MAIL_MODE || "capture";
  // Safe staging default: Nodemailer serializes mail without network delivery.
  if (mode === "capture") return { jsonTransport: true };
  if (mode !== "smtp-sink") throw new Error("Staging MAIL_MODE must be capture or smtp-sink");
  const host = process.env.SMTP_HOST || "";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !/^[a-z0-9-]+\.railway\.internal$/i.test(host)) {
    throw new Error("Staging SMTP_HOST must be a loopback or private Railway mail sink");
  }
  if (process.env.EMAIL_USER || process.env.EMAIL_PASS) {
    throw new Error("Remove provider credentials before using a staging mail sink");
  }
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
  return { host, port, secure: false, ignoreTLS: true };
}

module.exports = {
  staging,
  backgroundJobsEnabled: flag("BACKGROUND_JOBS_ENABLED", !staging),
  startupSchemaRepairEnabled: flag("STARTUP_SCHEMA_REPAIR_ENABLED", !staging),
  mailOptions,
};

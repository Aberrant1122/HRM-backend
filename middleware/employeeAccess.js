// Preserve existing self-service and administrator access until capabilities are agreed.
const canAccessConfidentialEmployee = (actor, targetId) => {
  if (!actor) return false;
  const actorId = Number(actor.id || actor.userId);
  const employeeId = Number(targetId);
  return actor.role === "admin" || (
    Number.isSafeInteger(actorId) && actorId > 0 &&
    Number.isSafeInteger(employeeId) && employeeId > 0 && actorId === employeeId
  );
};

const requireEmployeeAccess = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (!canAccessConfidentialEmployee(req.user, req.params.userId)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  return next();
};

module.exports = { canAccessConfidentialEmployee, requireEmployeeAccess };

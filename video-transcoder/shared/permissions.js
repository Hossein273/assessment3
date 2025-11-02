// permissions.js
function getGroups(user) {
  const g = user && user["cognito:groups"];
  if (!g) return [];
  return Array.isArray(g) ? g : [g];
}

// Middleware to require a specific group
function requireGroups(...allowed) {
  return (req, res, next) => {
    const groups = getGroups(req.user);
    const ok = groups.some((g) => allowed.includes(g));
    if (!ok) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    next();
  };
}

module.exports = { requireGroups, getGroups };

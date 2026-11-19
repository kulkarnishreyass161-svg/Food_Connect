
const jwt = require("jsonwebtoken");

// ==========================================
// VERIFY JWT
// ==========================================

function authenticateToken(req, res, next) {

    const authHeader = req.headers.authorization;

    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Authentication required. Please log in."
        });
    }

    try {

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                issuer: "FoodConnect"
            }
        );

        // Verify that the token contains a database user ID.
        if (!decoded.id) {
            return res.status(401).json({
                message: "Invalid authentication token. User ID is missing."
            });
        }

        req.user = decoded;

        console.log("Authenticated JWT user:", {
            id: req.user.id,
            role: req.user.role
        });

        next();

    } catch (error) {

        console.error("JWT verification error:", error.message);

        return res.status(403).json({
            message: "Invalid or expired authentication token."
        });

    }
}


// ==========================================
// ROLE-BASED AUTHORIZATION
// ==========================================

function authorizeRoles(...allowedRoles) {

    return (req, res, next) => {

        console.log("User role:", req.user?.role);
        console.log("Allowed roles:", allowedRoles);

        if (
            !req.user ||
            !allowedRoles.includes(
                String(req.user.role || "").trim().toUpperCase()
            )
        ) {

            return res.status(403).json({
                message: "You are not authorized to access this resource."
            });

        }

        next();

    };

}


module.exports = {
    authenticateToken,
    authorizeRoles
};

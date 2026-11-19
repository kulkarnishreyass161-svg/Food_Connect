
const express = require("express");
const router = express.Router();

const imagekit = require("../config/imagekit");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/authMiddleware");

// Generate secure ImageKit upload credentials
router.get(
    "/auth",
    authenticateToken,
    authorizeRoles("DONOR"),
    (req, res) => {

        try {

            const authParams =
                imagekit.helper.getAuthenticationParameters();

            res.status(200).json({
                ...authParams,
                publicKey: process.env.IMAGEKIT_PUBLIC_KEY
            });

        } catch (error) {

            console.error("ImageKit authentication error:", error);

            res.status(500).json({
                message: "Unable to generate upload authentication."
            });
        }
    }
);

module.exports = router;

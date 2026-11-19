
const express = require("express");
const pool = require("../database");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const router = express.Router();


// ==========================================
// GET LOGGED-IN USER'S PROFILE
// GET /api/profile
// ==========================================

router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                role,
                phone,
                address,
                city,
                state,
                pincode,
                bio,
                latitude,
                longitude,
                email_notifications,
                sms_notifications
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User profile not found."
            });
        }

        console.log("PROFILE FETCHED:", {
            id: result.rows[0].id,
            role: result.rows[0].role,
            latitude: result.rows[0].latitude,
            longitude: result.rows[0].longitude
        });

        return res.status(200).json({
            message: "Profile retrieved successfully.",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Get profile error:", error);

        return res.status(500).json({
            message: "Unable to retrieve profile."
        });
    }
});


// ==========================================
// UPDATE LOGGED-IN USER'S PROFILE
// PUT /api/profile
// ==========================================

router.put("/", authenticateToken, async (req, res) => {
    try {
        const {
            name,
            phone,
            address,
            city,
            state,
            pincode,
            bio,
            emailNotifications,
            smsNotifications,
            latitude,
            longitude
        } = req.body;


        // Validate name
        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                message: "Name is required."
            });
        }


        // Validate bio
        if (bio && bio.length > 500) {
            return res.status(400).json({
                message: "Description cannot exceed 500 characters."
            });
        }


        // Convert GPS coordinates
        const userLatitude =
            latitude === null || latitude === undefined || latitude === ""
                ? null
                : Number(latitude);

        const userLongitude =
            longitude === null || longitude === undefined || longitude === ""
                ? null
                : Number(longitude);


        // Validate numeric coordinates
        if (
            (userLatitude !== null && !Number.isFinite(userLatitude)) ||
            (userLongitude !== null && !Number.isFinite(userLongitude))
        ) {
            return res.status(400).json({
                message: "Invalid latitude or longitude."
            });
        }


        // Validate coordinate ranges
        if (
            (userLatitude !== null &&
                (userLatitude < -90 || userLatitude > 90)) ||
            (userLongitude !== null &&
                (userLongitude < -180 || userLongitude > 180))
        ) {
            return res.status(400).json({
                message: "Coordinates are outside valid ranges."
            });
        }


        // Both coordinates must be provided together
        if (
            (userLatitude === null) !==
            (userLongitude === null)
        ) {
            return res.status(400).json({
                message: "Both latitude and longitude are required."
            });
        }


        // ======================================
        // DEBUG: INCOMING GPS DATA
        // ======================================

        console.log("========== NGO GPS UPDATE ==========");

        console.log("Authenticated user ID:", req.user.id);

        console.log("Authenticated user role:", req.user.role);

        console.log("Received latitude:", userLatitude);

        console.log("Received longitude:", userLongitude);


        // ======================================
        // UPDATE PROFILE IN POSTGRESQL
        // ======================================

        const result = await pool.query(
            `UPDATE users
             SET
                name = $1,
                phone = $2,
                address = $3,
                city = $4,
                state = $5,
                pincode = $6,
                bio = $7,
                email_notifications = $8,
                sms_notifications = $9,

                latitude = CASE
                    WHEN UPPER(TRIM(role)) = 'NGO'
                         AND $10::DOUBLE PRECISION IS NOT NULL
                    THEN $10::DOUBLE PRECISION
                    ELSE latitude
                END,

                longitude = CASE
                    WHEN UPPER(TRIM(role)) = 'NGO'
                         AND $11::DOUBLE PRECISION IS NOT NULL
                    THEN $11::DOUBLE PRECISION
                    ELSE longitude
                END,

                updated_at = CURRENT_TIMESTAMP

             WHERE id = $12

             RETURNING
                id,
                name,
                email,
                role,
                phone,
                address,
                city,
                state,
                pincode,
                bio,
                latitude,
                longitude,
                email_notifications,
                sms_notifications`,

            [
                name.trim(),
                phone || null,
                address || null,
                city || null,
                state || null,
                pincode || null,
                bio || null,
                emailNotifications ?? true,
                smsNotifications ?? false,
                userLatitude,
                userLongitude,
                req.user.id
            ]
        );


        // ======================================
        // CHECK DATABASE UPDATE
        // ======================================

        if (result.rows.length === 0) {
            console.log("No user record updated for ID:", req.user.id);

            return res.status(404).json({
                message: "User profile not found."
            });
        }


        const updatedUser = result.rows[0];


        // ======================================
        // DEBUG: ACTUAL DATABASE VALUES
        // ======================================

        console.log("DATABASE UPDATE RESULT:", {
            id: updatedUser.id,
            role: updatedUser.role,
            latitude: updatedUser.latitude,
            longitude: updatedUser.longitude
        });

        console.log("====================================");


        return res.status(200).json({
            success: true,
            message: "Profile updated successfully!",
            user: updatedUser
        });


    } catch (error) {
        console.error("Update profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update profile."
        });
    }
});


module.exports = router;

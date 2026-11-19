    const express = require("express");
    const pool = require("../database");
    const { authenticateToken } = require("../middleware/authMiddleware");

    const router = express.Router();

    function validCoordinates(latitude, longitude) {
        return Number.isFinite(latitude) && Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 &&
            longitude >= -180 && longitude <= 180;
    }

    // GET /api/locations/map
    // Returns available food pickup points, opted-in NGO locations and
    // volunteers who explicitly enabled location sharing.
    router.get("/map", authenticateToken, async (req, res) => {
        try {
            const [donationsResult, ngosResult, volunteersResult] = await Promise.all([
                pool.query(
                    `SELECT
                        d.id,
                        d.donor_id AS user_id,
                        u.name AS donor_name,
                        d.food_name AS title,
                        d.category,
                        d.quantity,
                        d.unit,
                        d.pickup_location AS address,
                        d.pickup_latitude AS latitude,
                        d.pickup_longitude AS longitude,
                        d.expires_at,
                        'donor' AS type
                    FROM donations d
                    JOIN users u ON u.id = d.donor_id
                    WHERE d.status = 'Available'
                    AND d.expires_at > CURRENT_TIMESTAMP
                    AND d.pickup_latitude IS NOT NULL
                    AND d.pickup_longitude IS NOT NULL
                    ORDER BY d.created_at DESC`
                ),
                pool.query(
                    `SELECT
                        id AS user_id,
                        name,
                        COALESCE(NULLIF(address, ''), NULLIF(location, ''),
                            CONCAT_WS(', ', city, state)) AS address,
                        latitude,
                        longitude,
                        'ngo' AS type
                    FROM users
                    WHERE UPPER(role) = 'NGO'
                    AND location_sharing_enabled = TRUE
                    AND latitude IS NOT NULL
                    AND longitude IS NOT NULL
                    ORDER BY name`
                ),
                pool.query(
                    `SELECT
                        id AS user_id,
                        name,
                        COALESCE(NULLIF(address, ''), NULLIF(location, ''),
                            CONCAT_WS(', ', city, state)) AS address,
                        latitude,
                        longitude,
                        'volunteer' AS type
                    FROM users
                    WHERE UPPER(role) = 'VOLUNTEER'
                    AND location_sharing_enabled = TRUE
                    AND latitude IS NOT NULL
                    AND longitude IS NOT NULL
                    ORDER BY name`
                )
            ]);

            return res.json({
                donors: donationsResult.rows,
                ngos: ngosResult.rows,
                volunteers: volunteersResult.rows
            });
        } catch (error) {
            console.error("Map locations error:", error.message);
            return res.status(500).json({ message: "Unable to load map locations." });
        }
    });

    // POST /api/locations/me
    // Explicitly invoked by the signed-in user when they choose "Share my location".
    router.post("/me", authenticateToken, async (req, res) => {
        try {
            const latitude = Number(req.body.latitude);
            const longitude = Number(req.body.longitude);
            const shareLocation = req.body.shareLocation === true;

            if (!validCoordinates(latitude, longitude)) {
                return res.status(400).json({ message: "Valid latitude and longitude are required." });
            }

            const result = await pool.query(
                `UPDATE users
                SET latitude = $1,
                    longitude = $2,
                    location_sharing_enabled = $3
                WHERE id = $4
                RETURNING id, role, location_sharing_enabled`,
                [latitude, longitude, shareLocation, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "User account not found." });
            }

            return res.json({
                message: shareLocation
                    ? "Your location is now shared with FoodConnect users."
                    : "Your coordinates were saved and location sharing is off.",
                location: result.rows[0]
            });
        } catch (error) {
            console.error("Save user location error:", error.message);
            return res.status(500).json({ message: "Unable to save your location." });
        }
    });

    // PATCH /api/locations/me/sharing
    // Allows the user to stop sharing without deleting stored coordinates.
    router.patch("/me/sharing", authenticateToken, async (req, res) => {
        try {
            if (typeof req.body.enabled !== "boolean") {
                return res.status(400).json({ message: "enabled must be true or false." });
            }

            const result = await pool.query(
                `UPDATE users
                SET location_sharing_enabled = $1
                WHERE id = $2
                RETURNING location_sharing_enabled`,
                [req.body.enabled, req.user.id]
            );

            if (!result.rowCount) {
                return res.status(404).json({ message: "User account not found." });
            }

            return res.json({
                message: req.body.enabled ? "Location sharing enabled." : "Location sharing disabled.",
                location_sharing_enabled: result.rows[0].location_sharing_enabled
            });
        } catch (error) {
            console.error("Update location sharing error:", error.message);
            return res.status(500).json({ message: "Unable to update location sharing." });
        }
    });

    module.exports = router;

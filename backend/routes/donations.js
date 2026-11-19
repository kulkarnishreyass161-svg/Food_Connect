
const express = require("express");
const pool = require("../database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// TEST ROUTE
// ==========================================

router.get("/test", (req, res) => {
    res.json({
        message: "Donation routes are working!"
    });
});

// ==========================================
// ALLOWED FORM VALUES
// ==========================================

const allowedCategories = [
    "Cooked meals",
    "Fruits & vegetables",
    "Bakery",
    "Dairy",
    "Packaged food",
    "Grains & pulses",
    "Other"
];

const allowedUnits = [
    "Meals / servings",
    "Kilograms",
    "Grams",
    "Litres",
    "Millilitres",
    "Packets",
    "Boxes"
];

// ==========================================
// CREATE DONATION
// POST /api/donations
// ==========================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const {
                foodName,
                category,
                quantity,
                unit,
                details,
                preparedAt,
                expiresAt,
                pickupLocation,
                pickupLatitude,
                pickupLongitude,
                photos = []
            } = req.body;

            // Required fields
            if (
                typeof foodName !== "string" ||
                !foodName.trim() ||
                !category ||
                quantity === undefined ||
                quantity === null ||
                quantity === "" ||
                !unit ||
                !preparedAt ||
                !expiresAt ||
                typeof pickupLocation !== "string" ||
                !pickupLocation.trim()
            ) {
                return res.status(400).json({
                    message: "Please provide all required donation details."
                });
            }

            // Validate category
            if (!allowedCategories.includes(category)) {
                return res.status(400).json({
                    message: "Invalid food category."
                });
            }

            // Validate unit
            if (!allowedUnits.includes(unit)) {
                return res.status(400).json({
                    message: "Invalid quantity unit."
                });
            }

            // Validate quantity
            const numericQuantity = Number(quantity);

            if (
                !Number.isFinite(numericQuantity) ||
                numericQuantity <= 0
            ) {
                return res.status(400).json({
                    message: "Quantity must be greater than zero."
                });
            }

            // Validate dates
            const preparationDate = new Date(preparedAt);
            const expiryDate = new Date(expiresAt);

            if (
                Number.isNaN(preparationDate.getTime()) ||
                Number.isNaN(expiryDate.getTime())
            ) {
                return res.status(400).json({
                    message: "Invalid preparation or expiry date."
                });
            }

            if (expiryDate <= preparationDate) {
                return res.status(400).json({
                    message: "Expiry must be later than preparation."
                });
            }

            // Validate text lengths
            if (foodName.trim().length > 100) {
                return res.status(400).json({
                    message: "Food name cannot exceed 100 characters."
                });
            }

            if (pickupLocation.trim().length > 250) {
                return res.status(400).json({
                    message: "Pickup location cannot exceed 250 characters."
                });
            }

            if (
                details !== undefined &&
                details !== null &&
                (
                    typeof details !== "string" ||
                    details.length > 2000
                )
            ) {
                return res.status(400).json({
                    message: "Additional details are invalid or too long."
                });
            }

            // ==========================================
            // VALIDATE FOOD PHOTOS
            // ==========================================

            if (
                !Array.isArray(photos) ||
                photos.length > 4 ||
                photos.some(photo =>
                    typeof photo !== "string" ||
                    !photo.startsWith("https://")
                )
            ) {
                return res.status(400).json({
                    message: "Invalid food photos. Upload a maximum of 4 valid HTTPS image URLs."
                });
            }

            // ==========================================
            // VALIDATE GPS COORDINATES
            // ==========================================

            const hasLatitude =
                pickupLatitude !== undefined &&
                pickupLatitude !== null &&
                pickupLatitude !== "";

            const hasLongitude =
                pickupLongitude !== undefined &&
                pickupLongitude !== null &&
                pickupLongitude !== "";

            if (hasLatitude !== hasLongitude) {
                return res.status(400).json({
                    message: "Provide both pickup coordinates or leave both empty."
                });
            }

            const latitude = hasLatitude
                ? Number(pickupLatitude)
                : null;

            const longitude = hasLongitude
                ? Number(pickupLongitude)
                : null;

            if (
                hasLatitude &&
                (
                    !Number.isFinite(latitude) ||
                    latitude < -90 ||
                    latitude > 90 ||
                    !Number.isFinite(longitude) ||
                    longitude < -180 ||
                    longitude > 180
                )
            ) {
                return res.status(400).json({
                    message: "Pickup coordinates are invalid."
                });
            }

            // ==========================================
            // SAVE DONATION
            // ==========================================

            const result = await pool.query(
                `INSERT INTO donations (
                    donor_id,
                    food_name,
                    category,
                    quantity,
                    unit,
                    details,
                    prepared_at,
                    expires_at,
                    pickup_location,
                    pickup_latitude,
                    pickup_longitude,
                    photos
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11, $12::text[]
                )
                RETURNING *`,
                [
                    req.user.id,
                    foodName.trim(),
                    category,
                    numericQuantity,
                    unit,
                    details?.trim() || null,
                    preparedAt,
                    expiresAt,
                    pickupLocation.trim(),
                    latitude,
                    longitude,
                    photos
                ]
            );

            const savedDonation = result.rows[0];

            // ==========================================
            // QR CODE INFORMATION
            // ==========================================

            const qrData = {
                type: "FOODCONNECT_DONATION",
                donationId: savedDonation.id
            };

            return res.status(201).json({
                success: true,
                message: "Food donation posted successfully!",
                donation: savedDonation,
                qrData
            });

        } catch (error) {
            console.error("Create donation error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to create donation."
            });
        }
    }
);

// ==========================================
// GET DONOR'S DONATIONS
// GET /api/donations/my
// ==========================================

router.get(
    "/my",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT *
                 FROM donations
                 WHERE donor_id = $1
                 ORDER BY created_at DESC`,
                [req.user.id]
            );

            return res.json({
                donations: result.rows
            });

        } catch (error) {
            console.error("Get donations error:", error);

            return res.status(500).json({
                message: "Unable to retrieve donations."
            });
        }
    }
);

// ==========================================
// DONOR DASHBOARD STATISTICS
// GET /api/donations/dashboard
// ==========================================

router.get(
    "/dashboard",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    COUNT(*)::INTEGER AS total_donations,

                    COUNT(*) FILTER (
                        WHERE status IN (
                            'Available',
                            'Pickup scheduled'
                        )
                    )::INTEGER AS active_donations,

                    COUNT(*) FILTER (
                        WHERE status = 'Completed'
                    )::INTEGER AS completed_donations,

                    COALESCE(
                        SUM(quantity) FILTER (
                            WHERE status = 'Completed'
                            AND unit = 'Meals / servings'
                        ),
                        0
                    ) AS meals_shared

                 FROM donations
                 WHERE donor_id = $1`,
                [req.user.id]
            );

            return res.json({
                stats: result.rows[0]
            });

        } catch (error) {
            console.error("Dashboard statistics error:", error);

            return res.status(500).json({
                message: "Unable to retrieve dashboard statistics."
            });
        }
    }
);

// ==========================================
// UPDATE DONATION
// PUT /api/donations/:id
// ==========================================

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const donationId = Number(req.params.id);

            if (!Number.isInteger(donationId) || donationId <= 0) {
                return res.status(400).json({
                    message: "Invalid donation ID."
                });
            }

            const {
                foodName,
                category,
                quantity,
                unit,
                details,
                preparedAt,
                expiresAt,
                pickupLocation
            } = req.body;

            if (
                typeof foodName !== "string" ||
                !foodName.trim() ||
                !category ||
                quantity === undefined ||
                quantity === null ||
                quantity === "" ||
                !unit ||
                !preparedAt ||
                !expiresAt ||
                typeof pickupLocation !== "string" ||
                !pickupLocation.trim()
            ) {
                return res.status(400).json({
                    message: "Please provide all required donation details."
                });
            }

            if (!allowedCategories.includes(category)) {
                return res.status(400).json({
                    message: "Invalid food category."
                });
            }

            if (!allowedUnits.includes(unit)) {
                return res.status(400).json({
                    message: "Invalid quantity unit."
                });
            }

            const numericQuantity = Number(quantity);

            if (
                !Number.isFinite(numericQuantity) ||
                numericQuantity <= 0
            ) {
                return res.status(400).json({
                    message: "Quantity must be greater than zero."
                });
            }

            const preparationDate = new Date(preparedAt);
            const expiryDate = new Date(expiresAt);

            if (
                Number.isNaN(preparationDate.getTime()) ||
                Number.isNaN(expiryDate.getTime()) ||
                expiryDate <= preparationDate
            ) {
                return res.status(400).json({
                    message: "Please provide valid dates. Expiry must be later than preparation."
                });
            }

            if (
                foodName.trim().length > 100 ||
                pickupLocation.trim().length > 250 ||
                (
                    details !== undefined &&
                    details !== null &&
                    (
                        typeof details !== "string" ||
                        details.length > 2000
                    )
                )
            ) {
                return res.status(400).json({
                    message: "One or more fields exceed the allowed length."
                });
            }

            const result = await pool.query(
                `UPDATE donations
                 SET food_name = $1,
                     category = $2,
                     quantity = $3,
                     unit = $4,
                     details = $5,
                     prepared_at = $6,
                     expires_at = $7,
                     pickup_location = $8,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9
                   AND donor_id = $10
                   AND status = 'Available'
                 RETURNING *`,
                [
                    foodName.trim(),
                    category,
                    numericQuantity,
                    unit,
                    details?.trim() || null,
                    preparedAt,
                    expiresAt,
                    pickupLocation.trim(),
                    donationId,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Donation not found or cannot be edited. Only available donations can be edited."
                });
            }

            return res.json({
                success: true,
                message: "Donation updated successfully!",
                donation: result.rows[0]
            });

        } catch (error) {
            console.error("Update donation error:", error);

            return res.status(500).json({
                message: "Unable to update donation."
            });
        }
    }
);

// ==========================================
// CANCEL DONATION
// PATCH /api/donations/:id/cancel
// ==========================================

router.patch(
    "/:id/cancel",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const donationId = Number(req.params.id);

            if (!Number.isInteger(donationId) || donationId <= 0) {
                return res.status(400).json({
                    message: "Invalid donation ID."
                });
            }

            const result = await pool.query(
                `UPDATE donations
                 SET status = 'Cancelled',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND donor_id = $2
                   AND status = 'Available'
                 RETURNING *`,
                [donationId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Donation not found or cannot be cancelled. Only available donations can be cancelled."
                });
            }

            return res.json({
                success: true,
                message: "Donation cancelled successfully!",
                donation: result.rows[0]
            });

        } catch (error) {
            console.error("Cancel donation error:", error);

            return res.status(500).json({
                message: "Unable to cancel donation."
            });
        }
    }
);

// ==========================================
// GET AVAILABLE DONATIONS FOR FOOD SEARCH
// GET /api/donations/available
// ==========================================

router.get(
    "/available",
    authenticateToken,
    authorizeRoles("NGO", "VOLUNTEER"),
    async (req, res) => {
        try {
            const {
                search,
                category,
                location,
                sort
            } = req.query;

            let query = `
                SELECT
                    d.id,
                    d.donor_id,
                    u.name AS donor_name,
                    d.food_name,
                    d.category,
                    d.quantity,
                    d.unit,
                    d.details,
                    d.prepared_at,
                    d.expires_at,
                    d.pickup_location,
                    d.photos,
                    d.status,
                    d.created_at
                FROM donations d
                JOIN users u ON d.donor_id = u.id
                WHERE d.status = 'Available'
                  AND d.recipient_id IS NULL
                  AND d.expires_at > CURRENT_TIMESTAMP
            `;

            const values = [];
            let index = 1;

            // Search food name or details
            if (search && search.trim()) {
                query += `
                    AND (
                        d.food_name ILIKE $${index}
                        OR d.details ILIKE $${index}
                    )
                `;

                values.push(`%${search.trim()}%`);
                index++;
            }

            // Filter category
            if (category && category.trim()) {
                query += ` AND d.category = $${index}`;

                values.push(category.trim());
                index++;
            }

            // Filter pickup location
            if (location && location.trim()) {
                query += `
                    AND d.pickup_location ILIKE $${index}
                `;

                values.push(`%${location.trim()}%`);
                index++;
            }

            // Sorting
            if (sort === "expiry") {
                query += ` ORDER BY d.expires_at ASC`;
            } else {
                query += ` ORDER BY d.created_at DESC`;
            }

            const result = await pool.query(query, values);

            return res.json({
                count: result.rows.length,
                donations: result.rows
            });

        } catch (error) {
            console.error("Available donations error:", error);

            return res.status(500).json({
                message: "Unable to retrieve donations."
            });
        }
    }
);

// ==========================================
// GET ONE DONATION
// GET /api/donations/:id
// ==========================================

router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const donationId = Number(req.params.id);

            if (!Number.isInteger(donationId) || donationId <= 0) {
                return res.status(400).json({
                    message: "Invalid donation ID."
                });
            }

            const result = await pool.query(
                `SELECT *
                 FROM donations
                 WHERE id = $1
                   AND donor_id = $2`,
                [donationId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Donation not found."
                });
            }

            return res.json({
                donation: result.rows[0]
            });

        } catch (error) {
            console.error("Get donation error:", error);

            return res.status(500).json({
                message: "Unable to retrieve donation."
            });
        }
    }
);

module.exports = router;

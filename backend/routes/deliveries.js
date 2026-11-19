
const express = require("express");
const pool = require("../database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

// All delivery routes require volunteer authentication.
router.use(authenticateToken);
router.use(authorizeRoles("VOLUNTEER"));


// ==========================================
// CALCULATE ACTUAL ROAD DISTANCE USING OSRM
// ==========================================

async function getRoadDistanceKm(
    pickupLatitude,
    pickupLongitude,
    dropLatitude,
    dropLongitude
) {
    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${pickupLongitude},${pickupLatitude};` +
        `${dropLongitude},${dropLatitude}` +
        `?overview=false`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(
            `OSRM request failed with status ${response.status}`
        );
    }

    const data = await response.json();

    if (
        data.code !== "Ok" ||
        !Array.isArray(data.routes) ||
        data.routes.length === 0
    ) {
        throw new Error("No driving route was found.");
    }

    const distanceKm = data.routes[0].distance / 1000;

    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
        throw new Error("OSRM returned an invalid distance.");
    }

    return Number(distanceKm.toFixed(2));
}


// ==========================================
// CREATE DONOR AND NGO NOTIFICATIONS
// ==========================================

async function notifyDeliveryParties(
    client,
    task,
    title,
    message,
    type
) {
    const userIds = [
        task.donor_id,
        task.ngo_id
    ]
        .filter(id => id !== null && id !== undefined)
        .map(Number);

    // Prevent duplicate notifications if both IDs are identical.
    const uniqueUserIds = [...new Set(userIds)];

    for (const userId of uniqueUserIds) {
        await client.query(
            `INSERT INTO notifications (
                user_id,
                title,
                message,
                type,
                related_id
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                title,
                message,
                type,
                task.id
            ]
        );
    }
}


// ==========================================
// GET AVAILABLE DELIVERY TASKS
// GET /api/deliveries/available
// ==========================================

router.get("/available", async (req, res) => {
    try {
        const { search, sort } = req.query;

        let query = `
            SELECT
                dl.id AS delivery_id,
                dl.donation_id,
                dl.request_id,
                dl.pickup_location,
                dl.drop_location,
                dl.delivery_status,
                dl.distance_km,

                d.food_name,
                d.category,
                d.quantity,
                d.unit,
                d.expires_at,
                d.pickup_latitude,
                d.pickup_longitude,

                ngo.latitude AS drop_latitude,
                ngo.longitude AS drop_longitude,

                donor.name AS donor_name,
                donor.location AS donor_area,

                ngo.name AS ngo_name,
                ngo.location AS ngo_area

            FROM deliveries dl

            JOIN donations d
                ON d.id = dl.donation_id

            JOIN users donor
                ON donor.id = d.donor_id

            JOIN donation_requests dr
                ON dr.id = dl.request_id

            JOIN users ngo
                ON ngo.id = dr.requester_id

            WHERE dl.delivery_status = 'Available'
              AND d.status = 'Available'
              AND d.expires_at > CURRENT_TIMESTAMP
        `;

        const values = [];

        if (search && search.trim()) {
            values.push(`%${search.trim()}%`);

            query += `
                AND (
                    d.food_name ILIKE $1
                    OR donor.name ILIKE $1
                    OR ngo.name ILIKE $1
                    OR dl.pickup_location ILIKE $1
                    OR dl.drop_location ILIKE $1
                )
            `;
        }

        if (sort === "distance") {
            query += `
                ORDER BY dl.distance_km ASC NULLS LAST
            `;
        } else if (sort === "meals") {
            query += `
                ORDER BY d.quantity DESC
            `;
        } else {
            query += `
                ORDER BY d.expires_at ASC
            `;
        }

        const result = await pool.query(query, values);

        res.json({
            count: result.rows.length,
            deliveries: result.rows
        });

    } catch (error) {
        console.error("Available deliveries error:", error);

        res.status(500).json({
            message: "Unable to retrieve available deliveries."
        });
    }
});


// ==========================================
// GET VOLUNTEER'S ACTIVE DELIVERIES
// GET /api/deliveries/my
// ==========================================

router.get("/my", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                dl.id AS delivery_id,
                dl.donation_id,
                dl.request_id,
                dl.pickup_location,
                dl.drop_location,
                dl.delivery_status,
                dl.distance_km,
                dl.accepted_at,
                dl.pickup_started_at,
                dl.in_transit_at,

                d.food_name,
                d.category,
                d.quantity,
                d.unit,
                d.expires_at,
                d.pickup_latitude,
                d.pickup_longitude,

                ngo.latitude AS drop_latitude,
                ngo.longitude AS drop_longitude,

                donor.name AS donor_name,
                donor.location AS donor_area,

                ngo.name AS ngo_name,
                ngo.location AS ngo_area

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN users donor
                ON donor.id = d.donor_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             JOIN users ngo
                ON ngo.id = dr.requester_id

             WHERE dl.volunteer_id = $1
               AND dl.delivery_status IN (
                    'Accepted',
                    'Pickup in progress',
                    'In transit'
               )

             ORDER BY dl.accepted_at DESC`,
            [req.user.id]
        );

        res.json({
            deliveries: result.rows
        });

    } catch (error) {
        console.error("My deliveries error:", error);

        res.status(500).json({
            message: "Unable to retrieve your deliveries."
        });
    }
});


// ==========================================
// GET COMPLETED DELIVERIES
// GET /api/deliveries/completed
// ==========================================

router.get("/completed", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                dl.id AS delivery_id,
                dl.donation_id,
                dl.request_id,
                dl.pickup_location,
                dl.drop_location,
                dl.delivery_status,
                dl.distance_km,
                dl.accepted_at,
                dl.pickup_started_at,
                dl.in_transit_at,
                dl.delivered_at,

                d.food_name,
                d.category,
                d.quantity,
                d.unit,
                d.expires_at,

                donor.name AS donor_name,
                donor.location AS donor_area,

                ngo.name AS ngo_name,
                ngo.location AS ngo_area

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             JOIN users donor
                ON donor.id = d.donor_id

             JOIN users ngo
                ON ngo.id = dr.requester_id

             WHERE dl.volunteer_id = $1
               AND dl.delivery_status = 'Completed'

             ORDER BY dl.delivered_at DESC`,
            [req.user.id]
        );

        res.json({
            deliveries: result.rows
        });

    } catch (error) {
        console.error("Completed deliveries error:", error);

        res.status(500).json({
            message: "Unable to retrieve completed deliveries."
        });
    }
});


// ==========================================
// VOLUNTEER DASHBOARD STATISTICS
// GET /api/deliveries/stats
// ==========================================

router.get("/stats", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT

                COUNT(*) FILTER (
                    WHERE dl.delivery_status = 'Available'
                ) AS tasks_waiting,

                COUNT(*) FILTER (
                    WHERE dl.volunteer_id = $1
                      AND dl.delivery_status IN (
                          'Accepted',
                          'Pickup in progress',
                          'In transit'
                      )
                ) AS in_progress,

                COUNT(*) FILTER (
                    WHERE dl.volunteer_id = $1
                      AND dl.delivery_status = 'Completed'
                ) AS completed,

                COALESCE(
                    SUM(
                        CASE
                            WHEN dl.volunteer_id = $1
                             AND dl.delivery_status = 'Completed'
                             AND d.unit = 'Meals / servings'
                            THEN d.quantity::NUMERIC
                            ELSE 0
                        END
                    ), 0
                ) AS meals_delivered,

                COALESCE(
                    SUM(dl.distance_km) FILTER (
                        WHERE dl.volunteer_id = $1
                          AND dl.delivery_status = 'Completed'
                    ), 0
                ) AS distance_covered

             FROM deliveries dl

             LEFT JOIN donations d
                ON d.id = dl.donation_id

             WHERE dl.delivery_status = 'Available'
                OR dl.volunteer_id = $1`,
            [req.user.id]
        );

        const stats = result.rows[0];

        res.json({
            stats: {
                tasks_waiting: Number(stats.tasks_waiting),
                in_progress: Number(stats.in_progress),
                completed: Number(stats.completed),
                meals_delivered: Number(stats.meals_delivered),
                distance_covered: Number(
                    Number(stats.distance_covered).toFixed(2)
                )
            }
        });

    } catch (error) {
        console.error("Delivery statistics error:", error);

        res.status(500).json({
            message: "Unable to retrieve delivery statistics."
        });
    }
});


// ==========================================
// ACCEPT DELIVERY TASK
// POST /api/deliveries/:id/accept
// ==========================================

router.post("/:id/accept", async (req, res) => {
    const client = await pool.connect();

    try {
        const deliveryId = req.params.id;

        if (!/^\d+$/.test(deliveryId) || BigInt(deliveryId) <= 0n) {
            return res.status(400).json({
                message: "Invalid delivery ID."
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `SELECT
                dl.id,
                dl.donation_id,
                dl.delivery_status,

                d.status AS donation_status,
                d.donor_id,
                d.food_name,

                dr.requester_id AS ngo_id

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             WHERE dl.id = $1

             FOR UPDATE OF dl, d`,
            [deliveryId]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Delivery task not found."
            });
        }

        const task = result.rows[0];

        if (
            task.delivery_status !== "Available" ||
            task.donation_status !== "Available"
        ) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "This delivery task is no longer available."
            });
        }

        // Assign task to volunteer.

        await client.query(
            `UPDATE deliveries
             SET volunteer_id = $1,
                 delivery_status = 'Accepted',
                 accepted_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [req.user.id, deliveryId]
        );

        // Donation becomes Pickup scheduled only after
        // a volunteer accepts the delivery task.

        await client.query(
            `UPDATE donations
             SET status = 'Pickup scheduled',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [task.donation_id]
        );

        // Notify donor and NGO.

        await notifyDeliveryParties(
            client,
            task,
            "Volunteer Assigned",
            `A volunteer has accepted the delivery task for ${task.food_name}. Pickup arrangements are now in progress.`,
            "VOLUNTEER_ASSIGNED"
        );

        await client.query("COMMIT");

        res.json({
            message: "Delivery task accepted successfully."
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Rollback error:", rollbackError);
        }

        console.error("Accept delivery error:", error);

        res.status(500).json({
            message: "Unable to accept delivery task."
        });

    } finally {
        client.release();
    }
});


// ==========================================
// START PICKUP
// PATCH /api/deliveries/:id/pickup
// ==========================================


 // ==========================================
 // VERIFY DONATION QR AND START PICKUP
 // PATCH /api/deliveries/:id/pickup
 // ==========================================

router.patch("/:id/pickup", async (req, res) => {
    const client = await pool.connect();

    try {
        const deliveryId = req.params.id;
        const { donationId } = req.body;

        if (!/^\d+$/.test(deliveryId) || BigInt(deliveryId) <= 0n) {
            return res.status(400).json({
                message: "Invalid delivery ID."
            });
        }

        if (
            donationId === null ||
            donationId === undefined ||
            !/^\d+$/.test(String(donationId))
        ) {
            return res.status(400).json({
                message: "A valid scanned donation ID is required."
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `SELECT
                dl.id,
                dl.donation_id,
                dl.delivery_status,
                d.donor_id,
                d.food_name,
                dr.requester_id AS ngo_id

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             WHERE dl.id = $1
               AND dl.volunteer_id = $2

             FOR UPDATE OF dl`,
            [deliveryId, req.user.id]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Delivery task not found or not assigned to you."
            });
        }

        const task = result.rows[0];

        if (
            String(task.donation_id) !== String(donationId)
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "QR code does not belong to this delivery."
            });
        }

        if (task.delivery_status !== "Accepted") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "This delivery is not waiting for pickup verification."
            });
        }

        // Record the successful QR scan.

        await client.query(
            `INSERT INTO qr_scan_history (
                delivery_id,
                donation_id,
                scanned_by,
                scan_type,
                scan_status
            )
            VALUES ($1, $2, $3, 'PICKUP', 'SUCCESS')`,
            [
                deliveryId,
                task.donation_id,
                req.user.id
            ]
        );

        // Start pickup only after successful QR verification.

        await client.query(
            `UPDATE deliveries
             SET delivery_status = 'Pickup in progress',
                 pickup_started_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [deliveryId]
        );

        await notifyDeliveryParties(
            client,
            task,
            "Food Pickup Verified",
            `The volunteer scanned and verified the QR code for ${task.food_name}. Food pickup is now in progress.`,
            "PICKUP_VERIFIED"
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "QR verified. Food pickup is now in progress."
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Rollback error:", rollbackError);
        }

        console.error("QR pickup verification error:", error);

        res.status(500).json({
            message: "Unable to verify the donation QR code."
        });

    } finally {
        client.release();
    }
});


// ==========================================
// START TRANSIT
// PATCH /api/deliveries/:id/transit
// ==========================================

router.patch("/:id/transit", async (req, res) => {
    const client = await pool.connect();

    try {
        const deliveryId = req.params.id;

        if (!/^\d+$/.test(deliveryId) || BigInt(deliveryId) <= 0n) {
            return res.status(400).json({
                message: "Invalid delivery ID."
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `SELECT
                dl.id,
                dl.delivery_status,
                d.donor_id,
                d.food_name,
                dr.requester_id AS ngo_id

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             WHERE dl.id = $1
               AND dl.volunteer_id = $2
               AND dl.delivery_status = 'Pickup in progress'

             FOR UPDATE OF dl`,
            [deliveryId, req.user.id]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Task cannot be moved to transit."
            });
        }

        const task = result.rows[0];

        await client.query(
            `UPDATE deliveries
             SET delivery_status = 'In transit',
                 in_transit_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [deliveryId]
        );

        // Notify donor and NGO.

        await notifyDeliveryParties(
            client,
            task,
            "Food Delivery In Transit",
            `${task.food_name} has been picked up and is now on its way to the NGO.`,
            "IN_TRANSIT"
        );

        await client.query("COMMIT");

        res.json({
            message: "Delivery is now in transit."
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Rollback error:", rollbackError);
        }

        console.error("Transit update error:", error);

        res.status(500).json({
            message: "Unable to update transit status."
        });

    } finally {
        client.release();
    }
});


// ==========================================
// COMPLETE DELIVERY
// PATCH /api/deliveries/:id/complete
// ==========================================

router.patch("/:id/complete", async (req, res) => {
    const client = await pool.connect();

    try {
        const deliveryId = req.params.id;

        if (!/^\d+$/.test(deliveryId) || BigInt(deliveryId) <= 0n) {
            return res.status(400).json({
                message: "Invalid delivery ID."
            });
        }

        await client.query("BEGIN");

        // Fetch delivery and lock its row.
        // Retrieve donor and NGO GPS coordinates.

        const result = await client.query(
            `SELECT
                dl.id,
                dl.donation_id,
                dl.delivery_status,

                d.pickup_latitude,
                d.pickup_longitude,
                d.donor_id,
                d.food_name,

                dr.requester_id AS ngo_id,

                ngo.latitude AS drop_latitude,
                ngo.longitude AS drop_longitude

             FROM deliveries dl

             JOIN donations d
                ON d.id = dl.donation_id

             JOIN donation_requests dr
                ON dr.id = dl.request_id

             JOIN users ngo
                ON ngo.id = dr.requester_id

             WHERE dl.id = $1
               AND dl.volunteer_id = $2
               AND dl.delivery_status = 'In transit'

             FOR UPDATE OF dl`,
            [deliveryId, req.user.id]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Delivery cannot be completed."
            });
        }

        const task = result.rows[0];

        // Validate raw coordinates before converting them.
        // Number(null) becomes 0, so check null values first.

        const rawCoordinates = [
            task.pickup_latitude,
            task.pickup_longitude,
            task.drop_latitude,
            task.drop_longitude
        ];

        if (
            rawCoordinates.some(value =>
                value === null ||
                value === undefined ||
                value === ""
            )
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Pickup or NGO GPS coordinates are missing. Please update the location details before completing this delivery."
            });
        }

        const [
            pickupLatitude,
            pickupLongitude,
            dropLatitude,
            dropLongitude
        ] = rawCoordinates.map(Number);

        // Validate coordinate values and ranges.

        if (
            !Number.isFinite(pickupLatitude) ||
            !Number.isFinite(pickupLongitude) ||
            !Number.isFinite(dropLatitude) ||
            !Number.isFinite(dropLongitude) ||
            Math.abs(pickupLatitude) > 90 ||
            Math.abs(dropLatitude) > 90 ||
            Math.abs(pickupLongitude) > 180 ||
            Math.abs(dropLongitude) > 180
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Invalid pickup or NGO GPS coordinates."
            });
        }

        // Calculate actual driving distance using OSRM.

        let distanceKm;

        try {
            distanceKm = await getRoadDistanceKm(
                pickupLatitude,
                pickupLongitude,
                dropLatitude,
                dropLongitude
            );
        } catch (error) {
            await client.query("ROLLBACK");

            console.error("OSRM distance calculation error:", error);

            return res.status(502).json({
                message: "Unable to calculate the driving distance. Please try again."
            });
        }

        // Save road distance and complete delivery.

        const updateDelivery = await client.query(
            `UPDATE deliveries
             SET delivery_status = 'Completed',
                 distance_km = $1,
                 delivered_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP

             WHERE id = $2
               AND volunteer_id = $3
               AND delivery_status = 'In transit'

             RETURNING id, distance_km`,
            [distanceKm, deliveryId, req.user.id]
        );

        if (updateDelivery.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Delivery status changed. Please refresh and try again."
            });
        }

        // Update donation status after successful delivery.

        await client.query(
            `UPDATE donations
             SET status = 'Completed',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status = 'Pickup scheduled'`,
            [task.donation_id]
        );

        // Notify donor and NGO about completion.

        await notifyDeliveryParties(
            client,
            task,
            "Food Delivery Completed",
            `${task.food_name} has been successfully delivered to the NGO. Actual road distance covered: ${distanceKm} km.`,
            "DELIVERY_COMPLETED"
        );

        await client.query("COMMIT");

        res.json({
            message: "Delivery completed successfully.",
            distance_km: Number(
                updateDelivery.rows[0].distance_km
            )
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Transaction rollback error:", rollbackError);
        }

        console.error("Complete delivery error:", error);

        res.status(500).json({
            message: "Unable to complete delivery."
        });

    } finally {
        client.release();
    }
});


module.exports = router;


const express = require("express");
const pool = require("../database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();


// ==========================================
// NGO SUBMITS A DONATION REQUEST
// POST /api/requests/:donationId
// ==========================================

router.post(
    "/:donationId",
    authenticateToken,
    authorizeRoles("NGO"),
    async (req, res) => {
        try {
            const donationId = Number(req.params.donationId);

            if (!Number.isInteger(donationId) || donationId <= 0) {
                return res.status(400).json({
                    message: "Invalid donation ID"
                });
            }

            const donation = await pool.query(
                `SELECT
                    id,
                    donor_id,
                    recipient_id,
                    food_name,
                    status,
                    expires_at
                 FROM donations
                 WHERE id = $1`,
                [donationId]
            );

            if (donation.rows.length === 0) {
                return res.status(404).json({
                    message: "Donation not found"
                });
            }

            const food = donation.rows[0];

            if (Number(food.donor_id) === Number(req.user.id)) {
                return res.status(403).json({
                    message: "You cannot request your own donation"
                });
            }

            if (
                food.status !== "Available" ||
                food.recipient_id !== null ||
                new Date(food.expires_at) <= new Date()
            ) {
                return res.status(400).json({
                    message: "This donation is no longer available"
                });
            }

            // Insert NGO request
            const result = await pool.query(
                `INSERT INTO donation_requests (
                    donation_id,
                    requester_id,
                    status
                )
                VALUES ($1, $2, 'Requested')

                ON CONFLICT (donation_id, requester_id)
                DO UPDATE SET
                    status = 'Requested',
                    requested_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP

                WHERE donation_requests.status = 'Cancelled'

                RETURNING *`,
                [donationId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(409).json({
                    message: "You have already requested this donation or it has already been processed."
                });
            }

            // ==========================================
            // NOTIFY DONOR ABOUT NEW REQUEST
            // ==========================================

            await pool.query(
                `INSERT INTO notifications (
                    user_id,
                    title,
                    message,
                    type,
                    related_id
                )
                VALUES ($1, $2, $3, $4, $5)`,
                [
                    food.donor_id,
                    "New Food Request",
                    `${req.user.name || "An NGO"} has requested your donated food: ${food.food_name}.`,
                    "NEW_REQUEST",
                    result.rows[0].id
                ]
            );

            return res.status(201).json({
                message: "Donation request submitted successfully!",
                request: result.rows[0]
            });

        } catch (error) {
            console.error("Submit request error:", error);

            res.status(500).json({
                message: "Unable to submit donation request"
            });
        }
    }
);


// ==========================================
// NGO VIEWS ITS OWN REQUESTS
// GET /api/requests/my
// ==========================================

router.get(
    "/my",
    authenticateToken,
    authorizeRoles("NGO"),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    dr.id AS request_id,
                    dr.donation_id,
                    dr.status AS request_status,
                    dr.requested_at,
                    d.food_name,
                    d.category,
                    d.quantity,
                    d.unit,
                    d.pickup_location,
                    d.expires_at,
                    d.status AS donation_status,
                    u.name AS donor_name
                 FROM donation_requests dr
                 JOIN donations d ON dr.donation_id = d.id
                 JOIN users u ON d.donor_id = u.id
                 WHERE dr.requester_id = $1
                 ORDER BY dr.requested_at DESC`,
                [req.user.id]
            );

            res.json({
                requests: result.rows
            });

        } catch (error) {
            console.error("Fetch requests error:", error);

            res.status(500).json({
                message: "Unable to fetch your requests"
            });
        }
    }
);


// ==========================================
// NGO CANCELS ITS OWN PENDING REQUEST
// PATCH /api/requests/:id/cancel
// ==========================================

router.patch(
    "/:id/cancel",
    authenticateToken,
    authorizeRoles("NGO"),
    async (req, res) => {
        try {
            const requestId = req.params.id;

            if (!/^\d+$/.test(requestId) || BigInt(requestId) <= 0n) {
                return res.status(400).json({
                    message: "Invalid request ID"
                });
            }

            const result = await pool.query(
                `UPDATE donation_requests
                 SET status = 'Cancelled',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND requester_id = $2
                   AND status = 'Requested'
                 RETURNING *`,
                [requestId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Pending request not found"
                });
            }

            res.json({
                message: "Request cancelled successfully",
                request: result.rows[0]
            });

        } catch (error) {
            console.error("Cancel request error:", error);

            res.status(500).json({
                message: "Unable to submit cancellation"
            });
        }
    }
);


// ==========================================
// DONOR VIEWS INCOMING NGO REQUESTS
// GET /api/requests/received
// ==========================================

router.get(
    "/received",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    dr.id AS request_id,
                    dr.donation_id,
                    dr.status AS request_status,
                    dr.requested_at,
                    d.food_name,
                    d.category,
                    d.quantity,
                    d.unit,
                    d.pickup_location,
                    d.status AS donation_status,
                    u.name AS ngo_name,
                    u.email AS ngo_email
                 FROM donation_requests dr
                 JOIN donations d ON d.id = dr.donation_id
                 JOIN users u ON u.id = dr.requester_id
                 WHERE d.donor_id = $1
                 ORDER BY dr.requested_at DESC`,
                [req.user.id]
            );

            res.json(result.rows);

        } catch (error) {
            console.error("Error fetching incoming requests:", error);

            res.status(500).json({
                message: "Unable to fetch incoming requests."
            });
        }
    }
);


// ==========================================
// DONOR APPROVES AN NGO DONATION REQUEST
// PATCH /api/requests/:id/approve
// ==========================================

router.patch(
    "/:id/approve",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {

        const client = await pool.connect();

        try {
            const requestId = req.params.id;

            if (!/^\d+$/.test(requestId) || BigInt(requestId) <= 0n) {
                return res.status(400).json({
                    message: "Invalid request ID"
                });
            }

            await client.query("BEGIN");

            // Lock request and donation
            const result = await client.query(
                `SELECT
                    dr.id AS request_id,
                    dr.donation_id,
                    dr.status AS request_status,
                    dr.requester_id,
                    d.donor_id,
                    d.food_name,
                    d.status AS donation_status,
                    d.expires_at
                 FROM donation_requests dr
                 JOIN donations d ON d.id = dr.donation_id
                 WHERE dr.id = $1
                 FOR UPDATE OF dr, d`,
                [requestId]
            );

            if (result.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Request not found."
                });
            }

            const request = result.rows[0];

            // Verify donor owns this donation
            if (Number(request.donor_id) !== Number(req.user.id)) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Request not found."
                });
            }

            // Verify request and donation status
            if (
                request.request_status !== "Requested" ||
                request.donation_status !== "Available"
            ) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "This request has already been processed or the donation is unavailable."
                });
            }

            // Check expiry
            if (new Date(request.expires_at) <= new Date()) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "This donation has expired."
                });
            }

            // ==========================================
            // APPROVE SELECTED NGO REQUEST
            // ==========================================

            await client.query(
                `UPDATE donation_requests
                 SET status = 'Approved',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [requestId]
            );


            // ==========================================
            // NOTIFY SELECTED NGO
            // ==========================================

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
                    request.requester_id,
                    "Food Request Approved",
                    `The donor has approved your request for ${request.food_name}. Your delivery task is awaiting volunteer acceptance.`,
                    "REQUEST_APPROVED",
                    requestId
                ]
            );


            // ==========================================
            // REJECT OTHER PENDING REQUESTS
            // ==========================================

            const rejectedRequests = await client.query(
                `UPDATE donation_requests
                 SET status = 'Rejected',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE donation_id = $1
                   AND id <> $2
                   AND status = 'Requested'
                 RETURNING id, requester_id`,
                [request.donation_id, requestId]
            );


            // ==========================================
            // NOTIFY OTHER REJECTED NGOs
            // ==========================================

            for (const rejected of rejectedRequests.rows) {

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
                        rejected.requester_id,
                        "Food Request Not Approved",
                        `Another NGO's request for ${request.food_name} was approved by the donor.`,
                        "REQUEST_REJECTED",
                        rejected.id
                    ]
                );

            }


            // ==========================================
            // UPDATE DONATION RECIPIENT
            // KEEP DONATION STATUS AS AVAILABLE
            // ==========================================

            await client.query(
                `UPDATE donations
                 SET recipient_id = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [
                    request.requester_id,
                    request.donation_id
                ]
            );


            // ==========================================
            // CREATE DELIVERY TASK AUTOMATICALLY
            // ==========================================

            await client.query(
                `INSERT INTO deliveries (
                    donation_id,
                    request_id,
                    pickup_location,
                    drop_location,
                    delivery_status
                )
                SELECT
                    d.id,
                    $1,
                    d.pickup_location,
                    ngo.location,
                    'Available'
                FROM donations d
                JOIN users ngo ON ngo.id = $2
                WHERE d.id = $3
                ON CONFLICT (request_id) DO NOTHING`,
                [
                    requestId,
                    request.requester_id,
                    request.donation_id
                ]
            );


            // ==========================================
            // COMMIT ALL CHANGES
            // ==========================================

            await client.query("COMMIT");

            res.json({
                message: "Request approved successfully. Delivery task created and awaiting volunteer acceptance."
            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error("Error approving request:", error);

            res.status(500).json({
                message: "Unable to approve the request."
            });

        } finally {
            client.release();
        }
    }
);


// ==========================================
// DONOR REJECTS AN NGO DONATION REQUEST
// PATCH /api/requests/:id/reject
// ==========================================

router.patch(
    "/:id/reject",
    authenticateToken,
    authorizeRoles("DONOR"),
    async (req, res) => {
        try {
            const requestId = req.params.id;

            if (!/^\d+$/.test(requestId) || BigInt(requestId) <= 0n) {
                return res.status(400).json({
                    message: "Invalid request ID"
                });
            }

            const result = await pool.query(
                `UPDATE donation_requests dr
                 SET status = 'Rejected',
                     updated_at = CURRENT_TIMESTAMP
                 FROM donations d
                 WHERE dr.id = $1
                   AND dr.donation_id = d.id
                   AND d.donor_id = $2
                   AND dr.status = 'Requested'
                   AND d.status = 'Available'
                 RETURNING dr.id, dr.requester_id`,
                [requestId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Request not found or already processed."
                });
            }


            // ==========================================
            // NOTIFY NGO ABOUT REJECTION
            // ==========================================

            await pool.query(
                `INSERT INTO notifications (
                    user_id,
                    title,
                    message,
                    type,
                    related_id
                )
                VALUES ($1, $2, $3, $4, $5)`,
                [
                    result.rows[0].requester_id,
                    "Food Request Rejected",
                    "The donor has rejected your request for this food donation.",
                    "REQUEST_REJECTED",
                    result.rows[0].id
                ]
            );


            res.json({
                message: "Request rejected successfully."
            });

        } catch (error) {
            console.error("Error rejecting request:", error);

            res.status(500).json({
                message: "Unable to reject the request."
            });
        }
    }
);


module.exports = router;


const express = require("express");
const pool = require("../database");

const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

// ==========================================
// VALIDATE ROLE AND DATE FILTERS
// ==========================================

function getReportFilters(req, res) {
    const role = String(req.user.role || "").toUpperCase();

    if (!["DONOR", "NGO", "VOLUNTEER"].includes(role)) {
        res.status(403).json({
            message: "You are not authorized to access reports."
        });
        return null;
    }

    const { startDate, endDate } = req.query;

    const validDate = value =>
        !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

    if (!validDate(startDate) || !validDate(endDate)) {
        res.status(400).json({
            message: "Invalid date format. Use YYYY-MM-DD."
        });
        return null;
    }

    if (startDate && endDate && startDate > endDate) {
        res.status(400).json({
            message: "Start date cannot be later than end date."
        });
        return null;
    }

    return {
        role,
        userId: req.user.id,
        startDate: startDate || null,
        endDate: endDate || null
    };
}

// ==========================================
// GET REPORT SUMMARY
// GET /api/reports/summary
// ==========================================

router.get("/summary", async (req, res) => {
    try {
        const filters = getReportFilters(req, res);
        if (!filters) return;

        const { role, userId, startDate, endDate } = filters;

        let result;

        // --------------------------------------
        // DONOR REPORT
        // --------------------------------------

        if (role === "DONOR") {
            result = await pool.query(
                `SELECT
                    COUNT(*)::INTEGER AS total_donations,

                    COUNT(*) FILTER (
                        WHERE status = 'Available'
                    )::INTEGER AS available_donations,

                    COUNT(*) FILTER (
                        WHERE status = 'Pickup scheduled'
                    )::INTEGER AS scheduled_donations,

                    COUNT(*) FILTER (
                        WHERE status = 'Completed'
                    )::INTEGER AS completed_donations,

                    COUNT(*) FILTER (
                        WHERE status = 'Cancelled'
                    )::INTEGER AS cancelled_donations,

                    COALESCE(
                        SUM(quantity) FILTER (
                            WHERE status = 'Completed'
                              AND unit = 'Meals / servings'
                        ), 0
                    ) AS meals_shared

                 FROM donations

                 WHERE donor_id = $1
                   AND ($2::date IS NULL OR created_at >= $2::date)
                   AND ($3::date IS NULL OR created_at < $3::date + INTERVAL '1 day')`,
                [userId, startDate, endDate]
            );
        }

        // --------------------------------------
        // NGO REPORT
        // --------------------------------------

        else if (role === "NGO") {
            result = await pool.query(
                `SELECT
                    COUNT(*)::INTEGER AS total_requests,

                    COUNT(*) FILTER (
                        WHERE status = 'Requested'
                    )::INTEGER AS pending_requests,

                    COUNT(*) FILTER (
                        WHERE status = 'Approved'
                    )::INTEGER AS approved_requests,

                    COUNT(*) FILTER (
                        WHERE status = 'Rejected'
                    )::INTEGER AS rejected_requests,

                    COUNT(*) FILTER (
                        WHERE status = 'Cancelled'
                    )::INTEGER AS cancelled_requests,

                    COUNT(*) FILTER (
                        WHERE status = 'Approved'
                    )::INTEGER AS received_approved_requests

                 FROM donation_requests

                 WHERE requester_id = $1
                   AND ($2::date IS NULL OR requested_at >= $2::date)
                   AND ($3::date IS NULL OR requested_at < $3::date + INTERVAL '1 day')`,
                [userId, startDate, endDate]
            );

            // Count successfully completed food deliveries
            // received by this NGO during the selected period.

            const received = await pool.query(
                `SELECT
                    COUNT(*)::INTEGER AS completed_deliveries,
                    COALESCE(
                        SUM(d.quantity) FILTER (
                            WHERE d.unit = 'Meals / servings'
                        ), 0
                    ) AS meals_received

                 FROM deliveries dl

                 JOIN donation_requests dr
                    ON dr.id = dl.request_id

                 JOIN donations d
                    ON d.id = dl.donation_id

                 WHERE dr.requester_id = $1
                   AND dl.delivery_status = 'Completed'
                   AND ($2::date IS NULL OR dl.delivered_at >= $2::date)
                   AND ($3::date IS NULL OR dl.delivered_at < $3::date + INTERVAL '1 day')`,
                [userId, startDate, endDate]
            );

            result.rows[0].completed_deliveries =
                received.rows[0].completed_deliveries;

            result.rows[0].meals_received =
                received.rows[0].meals_received;
        }

        // --------------------------------------
        // VOLUNTEER REPORT
        // --------------------------------------

        else {
            result = await pool.query(
                `SELECT
                    COUNT(*)::INTEGER AS total_assigned_deliveries,

                    COUNT(*) FILTER (
                        WHERE delivery_status = 'Available'
                    )::INTEGER AS available_tasks,

                    COUNT(*) FILTER (
                        WHERE delivery_status IN (
                            'Accepted',
                            'Pickup in progress',
                            'In transit'
                        )
                    )::INTEGER AS in_progress_deliveries,

                    COUNT(*) FILTER (
                        WHERE delivery_status = 'Completed'
                    )::INTEGER AS completed_deliveries,

                    COALESCE(
                        SUM(distance_km) FILTER (
                            WHERE delivery_status = 'Completed'
                        ), 0
                    ) AS distance_covered

                 FROM deliveries

                 WHERE volunteer_id = $1
                   AND ($2::date IS NULL OR created_at >= $2::date)
                   AND ($3::date IS NULL OR created_at < $3::date + INTERVAL '1 day')`,
                [userId, startDate, endDate]
            );
        }

        return res.json({
            role,
            summary: result.rows[0],
            period: {
                startDate,
                endDate
            }
        });

    } catch (error) {
        console.error("Report summary error:", error);

        return res.status(500).json({
            message: "Unable to generate report summary."
        });
    }
});


// ==========================================
// GET DETAILED REPORT RECORDS
// GET /api/reports/details
// ==========================================

router.get("/details", async (req, res) => {
    try {
        const filters = getReportFilters(req, res);
        if (!filters) return;

        const { role, userId, startDate, endDate } = filters;

        let result;

        // --------------------------------------
        // DONOR DETAILS
        // --------------------------------------

        if (role === "DONOR") {
            result = await pool.query(
                `SELECT
                    id AS record_id,
                    food_name,
                    category,
                    quantity,
                    unit,
                    status,
                    pickup_location,
                    created_at AS activity_date,
                    expires_at

                 FROM donations

                 WHERE donor_id = $1
                   AND ($2::date IS NULL OR created_at >= $2::date)
                   AND ($3::date IS NULL OR created_at < $3::date + INTERVAL '1 day')

                 ORDER BY created_at DESC`,
                [userId, startDate, endDate]
            );
        }

        // --------------------------------------
        // NGO DETAILS
        // --------------------------------------

        else if (role === "NGO") {
            result = await pool.query(
                `SELECT
                    dr.id AS record_id,
                    dr.donation_id,
                    d.food_name,
                    d.category,
                    d.quantity,
                    d.unit,
                    dr.status AS request_status,
                    d.status AS donation_status,
                    dr.requested_at AS activity_date,
                    donor.name AS donor_name,
                    d.pickup_location

                 FROM donation_requests dr

                 JOIN donations d
                    ON d.id = dr.donation_id

                 JOIN users donor
                    ON donor.id = d.donor_id

                 WHERE dr.requester_id = $1
                   AND ($2::date IS NULL OR dr.requested_at >= $2::date)
                   AND ($3::date IS NULL OR dr.requested_at < $3::date + INTERVAL '1 day')

                 ORDER BY dr.requested_at DESC`,
                [userId, startDate, endDate]
            );
        }

        // --------------------------------------
        // VOLUNTEER DETAILS
        // --------------------------------------

        else {
            result = await pool.query(
                `SELECT
                    dl.id AS record_id,
                    dl.donation_id,
                    d.food_name,
                    d.category,
                    d.quantity,
                    d.unit,
                    dl.delivery_status,
                    dl.pickup_location,
                    dl.drop_location,
                    dl.distance_km,
                    dl.accepted_at,
                    dl.delivered_at,
                    COALESCE(
                        dl.delivered_at,
                        dl.in_transit_at,
                        dl.pickup_started_at,
                        dl.accepted_at,
                        dl.created_at
                    ) AS activity_date,
                    donor.name AS donor_name,
                    ngo.name AS ngo_name

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
                   AND ($2::date IS NULL OR
                        COALESCE(
                            dl.delivered_at,
                            dl.in_transit_at,
                            dl.pickup_started_at,
                            dl.accepted_at,
                            dl.created_at
                        ) >= $2::date)
                   AND ($3::date IS NULL OR
                        COALESCE(
                            dl.delivered_at,
                            dl.in_transit_at,
                            dl.pickup_started_at,
                            dl.accepted_at,
                            dl.created_at
                        ) < $3::date + INTERVAL '1 day')

                 ORDER BY activity_date DESC`,
                [userId, startDate, endDate]
            );
        }

        return res.json({
            role,
            count: result.rows.length,
            records: result.rows
        });

    } catch (error) {
        console.error("Report details error:", error);

        return res.status(500).json({
            message: "Unable to retrieve report details."
        });
    }
});

module.exports = router;

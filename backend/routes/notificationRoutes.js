
const express = require("express");
const pool = require("../database");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const router = express.Router();

// All notification routes require authentication.
router.use(authenticateToken);


// ==========================================
// GET ALL NOTIFICATIONS
// GET /api/notifications
// ==========================================

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Fetch notifications:", error);

        res.status(500).json({
            message: "Unable to fetch notifications."
        });
    }
});


// ==========================================
// GET UNREAD NOTIFICATION COUNT
// GET /api/notifications/unread-count
// ==========================================

router.get("/unread-count", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) AS unread_count
             FROM notifications
             WHERE user_id = $1
             AND is_read = FALSE`,
            [req.user.id]
        );

        res.json({
            unreadCount: Number(
                result.rows[0].unread_count
            )
        });

    } catch (error) {
        console.error("Unread count:", error);

        res.status(500).json({
            message: "Unable to fetch unread count."
        });
    }
});


// ==========================================
// MARK ONE NOTIFICATION AS READ
// PATCH /api/notifications/:id/read
// ==========================================

router.patch("/:id/read", async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = $1
             AND user_id = $2
             RETURNING *`,
            [req.params.id, req.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Notification not found."
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Mark notification read:", error);

        res.status(500).json({
            message: "Unable to update notification."
        });
    }
});


// ==========================================
// MARK ALL NOTIFICATIONS AS READ
// PATCH /api/notifications/read-all
// ==========================================

router.patch("/read-all", async (req, res) => {
    try {
        await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE user_id = $1
             AND is_read = FALSE`,
            [req.user.id]
        );

        res.json({
            message: "All notifications marked as read."
        });

    } catch (error) {
        console.error("Mark all read:", error);

        res.status(500).json({
            message: "Unable to update notifications."
        });
    }
});


// ==========================================
// DELETE NOTIFICATION
// DELETE /api/notifications/:id
// ==========================================

router.delete("/:id", async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM notifications
             WHERE id = $1
             AND user_id = $2
             RETURNING id`,
            [req.params.id, req.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Notification not found."
            });
        }

        res.json({
            message: "Notification deleted successfully."
        });

    } catch (error) {
        console.error("Delete notification:", error);

        res.status(500).json({
            message: "Unable to delete notification."
        });
    }
});


module.exports = router;

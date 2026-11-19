
document.addEventListener("DOMContentLoaded", async () => {
    const status = document.getElementById("status");
    const loginLink = document.getElementById("loginLink");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
        status.textContent = "Verification token is missing.";
        status.style.color = "red";
        return;
    }

    try {
        const response = await fetch(
            "https://food-connect-qnuq.onrender.com/api/auth/verify-email",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ token })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Verification failed.");
        }

        status.textContent =
            "Your email has been verified successfully! You can now log in.";

        status.style.color = "green";
        loginLink.hidden = false;

    } catch (error) {
        console.error("Verification error:", error);

        status.textContent =
            "Verification failed: " + error.message;

        status.style.color = "red";
    }
});


document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // TOAST MESSAGE
    // ==========================================

    function showToast(message) {
        const toast = document.getElementById("authToast");

        if (!toast) {
            alert(message);
            return;
        }

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(window.toastTimer);

        window.toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }


    // ==========================================
    // PASSWORD VISIBILITY
    // ==========================================

    document.querySelectorAll(".password-toggle").forEach(button => {

        button.addEventListener("click", () => {

            const input = document.getElementById(button.dataset.target);

            if (!input) return;

            const show = input.type === "password";

            input.type = show ? "text" : "password";

            button.textContent = show ? "🙈" : "👁";

        });

    });


    // ==========================================
    // REGISTRATION
    // ==========================================

    const registerForm = document.getElementById("registerForm");

    if (registerForm) {

        const roleCards = document.querySelectorAll(".role-card");

        const selectedRole = document.getElementById("selectedRole");

        const roleCaption = document.getElementById("roleCaption");

        const continueBtn = document.getElementById("continueBtn");

        const backStepBtn = document.getElementById("backStepBtn");

        const steps = document.querySelectorAll(".form-step");

        const progressFill = document.getElementById("progressFill");

        const password = document.getElementById("password");

        const confirmPassword = document.getElementById("confirmPassword");

        let currentStep = 1;


        // ROLE SELECTION

        roleCards.forEach(card => {

            card.addEventListener("click", () => {

                roleCards.forEach(item => {

                    item.classList.remove("selected");

                    item.setAttribute("aria-pressed", "false");

                });

                card.classList.add("selected");

                card.setAttribute("aria-pressed", "true");

                selectedRole.value = card.dataset.role;

            });

        });


        // CHANGE REGISTRATION STEP

        function changeStep(step) {

            currentStep = step;

            steps.forEach(section => {

                section.classList.toggle(
                    "active",
                    Number(section.dataset.step) === step
                );

            });

            if (progressFill) {
                progressFill.style.width = step === 1 ? "50%" : "100%";
            }

            if (roleCaption && selectedRole) {
                roleCaption.textContent =
                    "Joining as " + selectedRole.value;
            }

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        }


        // CONTINUE BUTTON

        if (continueBtn) {

            continueBtn.addEventListener("click", () => {

                const firstStep = document.querySelector(
                    '.form-step[data-step="1"]'
                );

                if (!firstStep) return;

                const requiredFields = firstStep.querySelectorAll(
                    "input[required]"
                );

                for (const field of requiredFields) {

                    if (!field.checkValidity()) {

                        field.reportValidity();

                        return;

                    }

                }

                if (!selectedRole.value) {

                    showToast("Please select your role.");

                    return;

                }

                changeStep(2);

            });

        }


        // BACK BUTTON

        if (backStepBtn) {

            backStepBtn.addEventListener("click", () => {

                changeStep(1);

            });

        }


        // PASSWORD MATCH VALIDATION

        function checkPasswordMatch() {

            if (
                confirmPassword.value &&
                password.value !== confirmPassword.value
            ) {

                confirmPassword.setCustomValidity(
                    "Passwords do not match."
                );

            } else {

                confirmPassword.setCustomValidity("");

            }

        }

        if (password && confirmPassword) {

            password.addEventListener("input", checkPasswordMatch);

            confirmPassword.addEventListener("input", checkPasswordMatch);

        }


        // SUBMIT REGISTRATION

        registerForm.addEventListener("submit", async event => {

            event.preventDefault();

            if (currentStep !== 2) return;

            checkPasswordMatch();

            if (!registerForm.checkValidity()) {

                registerForm.reportValidity();

                return;

            }

            const submitButton = registerForm.querySelector(
                'button[type="submit"]'
            );

            if (!submitButton) return;

            const originalText = submitButton.textContent;


            // REGISTRATION DATA

            const registrationData = {

                name: document.getElementById("fullName").value.trim(),

                email: document.getElementById("email").value.trim(),

                phone: document.getElementById("phone").value.trim(),

                role: selectedRole.value,

                location: document.getElementById("location").value.trim(),

                password: password.value,

                termsAccepted: document.getElementById("terms").checked

            };


            try {

                submitButton.disabled = true;

                submitButton.textContent = "Creating account...";


                const response = await fetch(
                    "https://food-connect-qnuq.onrender.com/api/auth/register",
                    {

                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify(registrationData)

                    }
                );


                const responseText = await response.text();

                let data;

                try {

                    data = JSON.parse(responseText);

                } catch (error) {

                    console.error(
                        "Registration server response:",
                        responseText
                    );

                    throw new Error(
                        "Backend returned an invalid response. Check the registration API."
                    );

                }


                if (!response.ok) {

                    throw new Error(
                        data.message || "Registration failed."
                    );

                }


                showToast("Account created successfully! Please verify your email.");


                setTimeout(() => {

                    window.location.href = "login.html";

                }, 1500);


            } catch (error) {

                console.error("Registration error:", error);

                showToast(error.message);


            } finally {

                submitButton.disabled = false;

                submitButton.textContent = originalText;

            }

        });

    }



    // ==========================================
    // LOGIN AUTHENTICATION
    // ==========================================

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {

        loginForm.addEventListener("submit", async event => {

            event.preventDefault();


            // GET LOGIN DETAILS

            const email = document.getElementById("loginEmail").value.trim();

            const password = document.getElementById("loginPassword").value;


            const rememberCheckbox = loginForm.querySelector(
                'input[name="remember"]'
            );

            const rememberMe = rememberCheckbox
                ? rememberCheckbox.checked
                : false;


            const submitButton = loginForm.querySelector(
                'button[type="submit"]'
            );

            if (!submitButton) return;

            const originalText = submitButton.textContent;


            try {

                submitButton.disabled = true;

                submitButton.textContent = "Signing in...";


                // SEND LOGIN REQUEST TO BACKEND

                const response = await fetch(
                    "https://food-connect-qnuq.onrender.com/api/auth/login",
                    {

                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({

                            email: email,

                            password: password

                        })

                    }
                );


                // READ RESPONSE ONLY ONCE

                const responseText = await response.text();

                let data;


                try {

                    data = JSON.parse(responseText);

                } catch (error) {

                    console.error(
                        "Login API returned HTML or invalid JSON:",
                        responseText
                    );

                    throw new Error(
                        "Backend returned HTML instead of JSON. Check your login API route."
                    );

                }


                // CHECK LOGIN RESPONSE

                if (!response.ok) {

                    throw new Error(
                        data.message || "Login failed."
                    );

                }


                // CHECK JWT TOKEN

                if (!data.token || !data.user) {

                    throw new Error(
                        "Login response does not contain a token or user."
                    );

                }


                // STORE AUTHENTICATION DETAILS

                const storage = rememberMe
                    ? localStorage
                    : sessionStorage;

                // Remove old login details from both storages
                localStorage.removeItem("token");
                localStorage.removeItem("user");

                sessionStorage.removeItem("token");
                sessionStorage.removeItem("user");

                storage.setItem("token", data.token);

                storage.setItem(
                    "user",
                    JSON.stringify(data.user)
                );


                // SUCCESS MESSAGE

                showToast(
                    "Login successful! Welcome to FoodConnect."
                );


                // REDIRECT TO HOME PAGE

                setTimeout(() => {

                    window.location.href = "profile.html";

                }, 1200);


            } catch (error) {

                console.error("Login error:", error);

                showToast(error.message);


            } finally {

                submitButton.disabled = false;

                submitButton.textContent = originalText;

            }

        });

    }

});

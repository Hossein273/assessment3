const registerForm = document.getElementById("registerForm");
const confirmForm = document.getElementById("confirmForm");
const registerStatus = document.getElementById("registerStatus");

// Step 1: User registration
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(registerForm);
  const data = {
    username: formData.get("username"),
    email: formData.get("email"),
    phone_number: formData.get("phone_number"), // 🔹 new field
    password: formData.get("password"),
  };

  if (!data.username || !data.email || !data.password || !data.phone_number) {
    registerStatus.textContent = "All fields are required.";
    return;
  }

  // Make sure phone is in E.164 format (+61412345678, +1..., etc.)
  if (!/^\+\d{10,15}$/.test(data.phone_number)) {
    registerStatus.textContent =
      "Phone number must be in E.164 format (e.g. +61412345678)";
    return;
  }

  const submitBtn = registerForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  registerStatus.textContent = "Registering...";

  try {
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      registerStatus.textContent =
        "Registration successful! Check your email for the confirmation code.";
      registerForm.style.display = "none";
      confirmForm.style.display = "block";
    } else {
      registerStatus.textContent = result.error || "Registration failed.";
    }
  } catch (err) {
    console.error("Register error:", err);
    registerStatus.textContent = "Registration failed. Please try again.";
  } finally {
    submitBtn.disabled = false;
  }
});

// Step 2: Confirm account
confirmForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(confirmForm);
  const data = {
    username: formData.get("username"),
    code: formData.get("code"),
  };

  if (!data.username || !data.code) {
    registerStatus.textContent = "Username and confirmation code required.";
    return;
  }

  const submitBtn = confirmForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  registerStatus.textContent = "Confirming account...";

  try {
    const res = await fetch("/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      registerStatus.textContent = "Account confirmed! Redirecting to login...";
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 1500);
    } else {
      registerStatus.textContent = result.error || "Confirmation failed.";
    }
  } catch (err) {
    console.error("Confirm error:", err);
    registerStatus.textContent = "Confirmation failed. Please try again.";
  } finally {
    submitBtn.disabled = false;
  }
});

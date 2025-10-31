const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const mfaStep = document.getElementById("mfaStep");
const mfaCodeInput = document.getElementById("mfaCode");
const mfaBtn = document.getElementById("mfaBtn");

let pendingSession = null;
let pendingUsername = null;

// Step 1: Username + Password
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(loginForm);
  const data = {
    username: formData.get("username"),
    password: formData.get("password"),
  };

  if (!data.username || !data.password) {
    loginStatus.textContent = "Username and password required.";
    return;
  }

  const submitBtn = loginForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  loginStatus.textContent = "Logging in...";

  try {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok && result.token) {
      // Normal login without MFA
      localStorage.setItem("token", result.token);
      window.location.href = "/transcoder";
    } else if (result.challengeName === "SMS_MFA") {
      // MFA required
      pendingSession = result.session;
      pendingUsername = data.username;

      loginStatus.textContent = "SMS code sent. Enter below:";
      mfaStep.style.display = "block"; // show MFA step
    } else {
      loginStatus.textContent = result.error || "Login failed.";
    }
  } catch (err) {
    console.error("Login error:", err);
    loginStatus.textContent = "Login failed. Please try again.";
  } finally {
    submitBtn.disabled = false;
  }
});

// Step 2: Respond to SMS MFA
mfaBtn.addEventListener("click", async () => {
  const code = mfaCodeInput.value.trim();
  if (!code) {
    loginStatus.textContent = "Please enter the SMS code.";
    return;
  }

  mfaBtn.disabled = true;
  loginStatus.textContent = "Verifying code...";

  try {
    const res = await fetch("/auth/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: pendingUsername,
        session: pendingSession,
        code,
      }),
    });

    const result = await res.json();

    if (res.ok && result.token) {
      // MFA success → save token
      localStorage.setItem("token", result.token);
      loginStatus.textContent = "MFA success! Redirecting...";
      setTimeout(() => (window.location.href = "/transcoder"), 1000);
    } else {
      loginStatus.textContent = result.error || "MFA verification failed.";
    }
  } catch (err) {
    console.error("MFA error:", err);
    loginStatus.textContent = "MFA verification failed. Try again.";
  } finally {
    mfaBtn.disabled = false;
  }
});

async function adminLogin() {
  const username = document.getElementById("adminUser").value.trim();
  const password = document.getElementById("adminPass").value;
  const button = document.querySelector(".btn-primary");
  button.disabled = true;

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Sign-in failed");

    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "block";
    document.getElementById("adminPass").value = "";
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function checkAdminSession() {
  try {
    const response = await fetch("/api/admin/me", { credentials: "same-origin" });
    if (response.ok) {
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("app").style.display = "block";
    }
  } catch {}
}

async function secureLogout() {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("adminPass").value = "";
}

window.addEventListener("DOMContentLoaded", checkAdminSession);


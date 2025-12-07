// public/main.js
import { STREET_NAMES, STREET_TYPES } from "./addressOptions.js";

function populateSelect(selectId, options, placeholderLabel) {
  const select = document.getElementById(selectId);
  if (!select) {
    console.warn("No select found with id", selectId);
    return;
  }

  select.innerHTML = "";

  if (placeholderLabel) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderLabel;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
  }

  options.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function init() {
  console.log("Initializing form selects");
  populateSelect("sname", STREET_NAMES, "-STREET-");
  populateSelect("stype", STREET_TYPES, "-TYPE-");

  const form = document.getElementById("signup-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const phone = document.getElementById("phone").value;
    const laddr = document.getElementById("laddr").value;
    const sdir = document.getElementById("sdir").value;
    const sname = document.getElementById("sname").value;
    const stype = document.getElementById("stype").value;

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = "Submitting...";

    try {
      const res = await fetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, laddr, sdir, sname, stype }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      if (statusEl) statusEl.textContent = data.message || "Signup success!";
    } catch (err) {
      console.error(err);
      if (statusEl) {
        statusEl.textContent =
          "Error submitting signup. Please try again in a bit.";
      }
    }
  });
}

// Call init after DOM is ready
document.addEventListener("DOMContentLoaded", init);

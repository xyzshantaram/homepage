const status = document.querySelector("#login-status");
const nsecInput = document.querySelector("#nsec");

function setStatus(message) {
  if (status) {
    status.textContent = message;
  }
}

function makeEvent(action) {
  return {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "shantaram-admin"]],
    content: JSON.stringify(action),
  };
}

async function submit(event) {
  const response = await fetch("/api/v1/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    setStatus(
      data?.error?.code === "Replay"
        ? "That sign-in was already used."
        : "Sign-in failed.",
    );
    return false;
  }

  sessionStorage.removeItem("admin:nsec");
  if (nsecInput) {
    nsecInput.value = "";
  }
  location.assign("/admin");
  return true;
}

document.querySelector("#nip07-login")?.addEventListener("click", async () => {
  if (!window.nostr) {
    setStatus("No NIP-07 extension found.");
    return;
  }

  try {
    const event = await window.nostr.signEvent(makeEvent({ action: "login" }));
    setStatus("Signing in…");
    await submit(event);
  } catch {
    setStatus("Signing failed.");
  }
});

document.querySelector("#nsec-login")?.addEventListener("click", async () => {
  const nsec = nsecInput?.value?.trim();
  if (!nsec) {
    setStatus("Enter an nsec.");
    return;
  }

  sessionStorage.setItem("admin:nsec", nsec);

  try {
    setStatus("Signing in…");
    const { finalizeEvent, nip19 } = await import(
      "https://cdn.jsdelivr.net/npm/nostr-tools@2/+esm"
    );
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") {
      throw new Error("not an nsec");
    }

    const event = finalizeEvent(makeEvent({ action: "login" }), decoded.data);
    await submit(event);
  } catch {
    sessionStorage.removeItem("admin:nsec");
    if (nsecInput) {
      nsecInput.value = "";
    }
    setStatus("Sign-in failed. Check the nsec.");
  }
});

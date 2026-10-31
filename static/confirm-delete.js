document.querySelectorAll("button.orphan-download").forEach((button) => {
  button.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = button.dataset.url ?? "";
    link.download = "";
    link.click();
  });
});

document.querySelectorAll("form.orphan-delete-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm("Delete this file? This cannot be undone.")) {
      event.preventDefault();
    }
  });
});

document.querySelectorAll("form.comment-delete-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm("Delete this comment? This cannot be undone.")) {
      event.preventDefault();
    }
  });
});

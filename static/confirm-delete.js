document.querySelectorAll("form.comment-delete-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm("Delete this comment? This cannot be undone.")) {
      event.preventDefault();
    }
  });
});

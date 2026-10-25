document.querySelectorAll(".comment").forEach((comment) => {
  const button = comment.querySelector(".comment-reply");
  const author =
    comment.querySelector(".comment-author")?.textContent?.trim() ||
    "Anonymous";
  const body = comment.querySelector(".comment-body")?.innerText?.trim() || "";

  button?.addEventListener("click", () => {
    const textarea = document.querySelector("#comment-content");
    if (!textarea) return;

    const quoted = `> **_@${author}_** wrote:  \n${body
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n\n`;

    textarea.value = textarea.value.trim()
      ? `${textarea.value}\n${quoted}`
      : quoted;
    textarea.focus();
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

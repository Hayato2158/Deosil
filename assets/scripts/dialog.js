const issueTab = document.getElementById("issueTab");
const issueDialog = document.getElementById("issueDialog");
const issueCancel = document.getElementById("issueCancel");
const issueGo = document.getElementById("issueGo");

const ISSUE_FORM_URL = "https://forms.gle/hhicgZtEgTB9C8Zf9";

issueTab?.addEventListener("click", (e) => {
    e.preventDefault(); // ← aタグの遷移を止める
    issueDialog.classList.remove("hidden");
});

issueCancel?.addEventListener("click", () => {
    issueDialog.classList.add("hidden");
});

issueGo?.addEventListener("click", () => {
    window.open(ISSUE_FORM_URL, "_blank", "noopener");
    issueDialog.classList.add("hidden");
});

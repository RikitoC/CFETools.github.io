const themeToggle = document.getElementById("theme-toggle");
const root = document.documentElement;

function updateToggleLabel() {
    const currentTheme = root.getAttribute("data-theme");

    if (currentTheme === "light") {
        themeToggle.setAttribute("aria-label", "Switch to dark mode");
    } else {
        themeToggle.setAttribute("aria-label", "Switch to light mode");
    }
}

themeToggle.addEventListener("click", () => {
    const currentTheme = root.getAttribute("data-theme");
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("cfe-theme", nextTheme);

    updateToggleLabel();
});

updateToggleLabel();

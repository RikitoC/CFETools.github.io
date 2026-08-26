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

/* ==================================================
   Expandable tool row panels
================================================== */

const toolsGrid = document.querySelector(".tools-grid");
const toolExpanders = document.querySelectorAll(".tool-expander[data-panel]");

let activeExpander = null;
let activePanel = null;
let closeTimer = null;

function getGridCards() {
    if (!toolsGrid) return [];

    return Array.from(toolsGrid.children).filter((element) =>
        element.classList.contains("tool-card")
    );
}

function placePanelAfterExpanderRow(expander, panel) {
    const cards = getGridCards();
    const expanderTop = expander.offsetTop;

    const rowCards = cards.filter((card) =>
        Math.abs(card.offsetTop - expanderTop) < 2
    );

    const lastCardInRow = rowCards[rowCards.length - 1] || expander;
    lastCardInRow.insertAdjacentElement("afterend", panel);
}

function finishPanelClose(expander, panel) {
    panel.classList.remove("is-open");
    panel.hidden = true;
    panel.style.height = "";
    panel.setAttribute("aria-hidden", "true");

    expander.classList.remove("is-open");
    expander.setAttribute("aria-expanded", "false");

    if (activePanel === panel) {
        activePanel = null;
        activeExpander = null;
    }
}

function closePanel(expander, panel, immediate = false) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }

    if (immediate || panel.hidden) {
        finishPanelClose(expander, panel);
        return;
    }

    panel.style.height = `${panel.scrollHeight}px`;

    requestAnimationFrame(() => {
        panel.classList.remove("is-open");
        panel.style.height = "0px";
        expander.classList.remove("is-open");
        expander.setAttribute("aria-expanded", "false");
    });

    closeTimer = window.setTimeout(() => {
        finishPanelClose(expander, panel);
        closeTimer = null;
    }, 400);
}

function openPanel(expander, panel) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }

    if (activePanel && activePanel !== panel && activeExpander) {
        closePanel(activeExpander, activePanel, true);
    }

    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    placePanelAfterExpanderRow(expander, panel);

    panel.style.height = "0px";

    /* Force the browser to recognize the collapsed starting point
       before animating to the panel's measured content height. */
    panel.getBoundingClientRect();

    const targetHeight = panel.scrollHeight;

    requestAnimationFrame(() => {
        panel.classList.add("is-open");
        panel.style.height = `${targetHeight}px`;

        expander.classList.add("is-open");
        expander.setAttribute("aria-expanded", "true");
    });

    window.setTimeout(() => {
        if (panel.classList.contains("is-open")) {
            panel.style.height = "auto";
        }
    }, 400);

    activeExpander = expander;
    activePanel = panel;
}

toolExpanders.forEach((expander) => {
    const panelId = expander.dataset.panel;
    const panel = document.getElementById(panelId);

    if (!panel) return;

    expander.addEventListener("click", () => {
        const isOpen = expander.getAttribute("aria-expanded") === "true";

        if (isOpen) {
            closePanel(expander, panel);
        } else {
            openPanel(expander, panel);
        }
    });
});

/* If the viewport changes enough to alter the number of grid columns,
   keep an open panel beneath the expander's new responsive row. */
window.addEventListener("resize", () => {
    if (!activeExpander || !activePanel || activePanel.hidden) return;

    placePanelAfterExpanderRow(activeExpander, activePanel);
    activePanel.style.height = "auto";
});


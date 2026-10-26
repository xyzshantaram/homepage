import { html, r } from "https://esm.sh/jsr/@campfire/core@4.0.4";

/* ── Constants ────────────────────────────────────────────────────────────── */

const RATE = { "₹": 3500, "$": 35 };

const CURRENCY = { "india": "₹", "rest-of-world": "$" };

const HOURS = {
  "web-development": {
    "small-fries": [3, 6],
    "burger": [8, 14],
    "deluxe": [15, 25],
    "vip": [26, 40],
  },
  "application-development": {
    "small-fries": [6, 10],
    "burger": [15, 30],
    "deluxe": [31, 50],
    "vip": [51, 80],
  },
  "electronics-design": {
    "small-fries": [8, 12],
    "burger": [20, 35],
    "deluxe": [40, 60],
    "vip": [70, 100],
  },
};
const HOURS_FALLBACK = [4, 7];

const MAINTENANCE_HOURS = 8;
const RETAINER_FEE = { "₹": 20000, "$": 200 };

const REQUIRED = ["location", "service", "scope"];

const QUESTIONS = [
  {
    name: "location",
    title: "Choose your location",
    options: [
      { value: "india", label: "India" },
      { value: "rest-of-world", label: "Rest of World" },
    ],
  },
  {
    name: "service",
    title: "Choose your service",
    options: [
      { value: "web-development", label: "Web Development" },
      { value: "application-development", label: "Application Development" },
      { value: "electronics-design", label: "Electronics Design" },
    ],
  },
  {
    name: "scope",
    title: "Choose your meal",
    options: [
      {
        value: "small-fries",
        label:
          "<strong>🍟 Small Fries</strong> Quick, simple, no frills. (E.g., basic website setup, simple electronic design)",
      },
      {
        value: "burger",
        label:
          "<strong>🍔 Burger</strong> A full, satisfying project with core features. (E.g., functional website with interactivity, more complex PCB design)",
      },
      {
        value: "deluxe",
        label:
          "<strong>🍔+🍟+🥤 Deluxe</strong> Everything needed for a complete experience. (E.g., payment processing, API integration, detailed test suite)",
      },
      {
        value: "vip",
        label:
          "<strong>🍔+🍟+🥤+🍨 VIP Feast</strong> Fancy! Fully customized, high-end service with extra attention to detail. (E.g., end-to-end product development, consulting, full-stack development, multiple frontends)",
      },
    ],
  },
  {
    name: "contract",
    title: "Choose your maintenance contract",
    options: [
      { value: "one-off", label: "One-off (maintenance not required)" },
      { value: "retainer", label: "<strong>Retainer</strong> - get 28.57% off!" },
      { value: "rehire", label: "Rehire as necessary" },
    ],
  },
];

/* ── Templates ────────────────────────────────────────────────────────────── */

const questionGroup = (question) => {
  const choices = question.options.map(({ value, label }) => {
    const id = `${question.name}-${value}`;
    return html`
      <label for="${id}">
        <input type="radio" name="${question.name}" value="${value}" id="${id}">
        <span>${r(label)}</span>
      </label>
    `;
  });

  return html`
    <fieldset>
      <legend>${question.title}</legend>
      ${r(choices.join(""))}
    </fieldset>
  `;
};

const estimateTemplate = ({ currency, min, max, monthly, maintenanceInfo }) => html`
  <p class="estimate-container">
    <strong>${min}</strong> - <strong>${max}</strong>
    (varies based on project details)
    ${monthly > 0
      ? `+ ${currency}${monthly}/mo for maintenance contract`
      : ""}
  </p>
  ${maintenanceInfo ? html`<p>${maintenanceInfo}</p>` : ""}
`;

/* ── Component ────────────────────────────────────────────────────────────── */

class ServicesEstimate extends HTMLElement {
  #form;
  #estimate;
  #heading;

  connectedCallback() {
    this.style.display = "block";
    this.innerHTML = html`
      <p><a href="#" class="reset-link" role="button">Reset form</a></p>

      <form id="services-estimate-form">
        ${r(QUESTIONS.map(questionGroup).join(""))}
      </form>

      <h2 id="estimate-heading">Your Estimate</h2>
      <div id="results-container"></div>
    `;

    this.#form = this.querySelector("#services-estimate-form");
    this.#estimate = this.querySelector("#results-container");
    this.#heading = this.querySelector("#estimate-heading");

    this.#form.addEventListener("change", () => this.#update());
    this.querySelectorAll(".reset-link").forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.#reset();
      })
    );

    this.#reset();
  }

  #reset() {
    this.#form.querySelectorAll("input").forEach((input) => (input.checked = false));
    this.#estimate.innerHTML = "";
    this.#heading.style.display = "none";
  }

  #update() {
    const data = new FormData(this.#form);
    if (REQUIRED.some((name) => !data.get(name))) return;

    const currency = CURRENCY[data.get("location")];
    const base = RATE[currency];
    const [minHours, maxHours] =
      HOURS[data.get("service")]?.[data.get("scope")] ?? HOURS_FALLBACK;

    const at = (multiplier = 1) => `${currency}${(base * multiplier).toFixed(2)}`;

    let monthly = -1;
    let maintenanceInfo = "";

    if (data.get("contract") === "retainer") {
      monthly = RETAINER_FEE[currency];
      maintenanceInfo =
        `${MAINTENANCE_HOURS} hours of monthly maintenance included at ` +
        `${currency}${(monthly / MAINTENANCE_HOURS).toFixed(2)}/hr = ` +
        `${currency}${monthly.toFixed(2)} payable monthly.`;
    } else if (data.get("contract") === "rehire") {
      monthly = 0;
      maintenanceInfo = `Maintenance at ${at()}/hr. Minimum bill of 1 hour.`;
    }

    this.#heading.style.display = "block";
    this.#estimate.innerHTML = estimateTemplate({
      currency,
      min: at(minHours),
      max: at(maxHours),
      monthly,
      maintenanceInfo,
    });
  }
}

customElements.define("services-estimate", ServicesEstimate);

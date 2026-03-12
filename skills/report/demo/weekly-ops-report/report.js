const payload = __REPORT_DATA__;
const reportData = payload?.ranges && typeof payload.ranges === "object" ? payload.ranges : payload;
const defaultRange = payload?.defaultRange && reportData?.[payload.defaultRange] ? payload.defaultRange : "7";

let lineChart;
let barChart;
let donutChart;

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCurrency(value) {
  return `$${numberFormatter.format(value)}`;
}

function animateValue(element, value, formatter, duration = 800) {
  const start = 0;
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const current = start + (value - start) * progress;
    element.textContent = formatter(current, progress);
    if (progress < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function updateKpis(data) {
  const kpis = data.kpis;
  const elements = document.querySelectorAll("[data-metric]");
  elements.forEach((el) => {
    const key = el.getAttribute("data-metric");
    const value = kpis[key];
    if (value === undefined) return;

    let formatter = (current) => numberFormatter.format(Math.round(current));
    if (key === "netRevenue") formatter = (current) => formatCurrency(Math.round(current));
    if (key.endsWith("Rate") || key.includes("Retention") || key === "dauWau") {
      formatter = (current) => `${current.toFixed(1)}%`;
    }

    animateValue(el, value, formatter);
  });

  const periodEl = document.getElementById("report-period");
  if (periodEl) periodEl.textContent = data.period;

  const headlineEl = document.getElementById("headline-metric");
  if (headlineEl) headlineEl.textContent = data.headline;
}

function updateLists(data) {
  const highlightList = document.getElementById("highlight-list");
  highlightList.innerHTML = "";
  data.highlights.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    highlightList.appendChild(li);
  });

  const tableBody = document.getElementById("channel-table");
  tableBody.innerHTML = "";
  data.channels.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.channel}</td>
      <td>${row.spend}</td>
      <td>${row.leads}</td>
      <td>${row.cvr}</td>
      <td>${row.cpa}</td>
      <td>${row.note}</td>
    `;
    tableBody.appendChild(tr);
  });

  const anomalyGrid = document.getElementById("anomaly-grid");
  anomalyGrid.innerHTML = "";
  data.anomalies.forEach((item) => {
    const card = document.createElement("div");
    card.className = "anomaly-card";
    card.innerHTML = `
      <strong>${item.title}</strong>
      <span>${item.detail}</span>
      <span>Owner: ${item.owner}</span>
    `;
    anomalyGrid.appendChild(card);
  });
}

function buildCharts(data) {
  const lineCtx = document.getElementById("line-chart").getContext("2d");
  const barCtx = document.getElementById("bar-chart").getContext("2d");
  const donutCtx = document.getElementById("donut-chart").getContext("2d");

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels: data.line.labels,
      datasets: [
        {
          label: "DAU",
          data: data.line.values,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: "#38bdf8"
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } }
      }
    }
  });

  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: data.bar.labels,
      datasets: [
        {
          label: "Leads",
          data: data.bar.values,
          backgroundColor: ["#38bdf8", "#0ea5e9", "#22d3ee", "#34d399", "#a7f3d0"],
          borderRadius: 8
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } }
      }
    }
  });

  donutChart = new Chart(donutCtx, {
    type: "doughnut",
    data: {
      labels: data.donut.labels,
      datasets: [
        {
          data: data.donut.values,
          backgroundColor: ["#38bdf8", "#34d399", "#facc15"],
          borderWidth: 0
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e2e8f0" }
        }
      }
    }
  });
}

function updateCharts(data) {
  lineChart.data.labels = data.line.labels;
  lineChart.data.datasets[0].data = data.line.values;
  lineChart.update();

  barChart.data.labels = data.bar.labels;
  barChart.data.datasets[0].data = data.bar.values;
  barChart.update();

  donutChart.data.labels = data.donut.labels;
  donutChart.data.datasets[0].data = data.donut.values;
  donutChart.update();
}

function setActiveRange(rangeKey) {
  const data = reportData[rangeKey];
  if (!data) return;

  updateKpis(data);
  updateLists(data);

  if (!lineChart) {
    buildCharts(data);
  } else {
    updateCharts(data);
  }
}

const buttons = document.querySelectorAll(".range-toggle button");
buttons.forEach((button) => {
  button.addEventListener("click", () => {
    buttons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    const rangeKey = button.getAttribute("data-range");
    setActiveRange(rangeKey);
  });
});

setActiveRange(defaultRange);

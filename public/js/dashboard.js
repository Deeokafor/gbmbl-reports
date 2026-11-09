let rawData = {};
let trendChartInstance = null;
let distributionChartInstance = null;

function formatNaira(num) {
  return '₦' + Number(num).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function initDashboard() {
  try {
    // Attempt local API first (server.py), fallback to static data file (GitHub Pages)
    let res = await fetch('/api/data').catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('./data/historical_sales.json');
    }
    rawData = await res.json();
    
    const monthSelect = document.getElementById('monthSelect');
    monthSelect.innerHTML = '';
    
    const keys = Object.keys(rawData);
    keys.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === 'June 2026') opt.selected = true;
      monthSelect.appendChild(opt);
    });

    renderHistoricalTrend();
    renderSelectedMonth();
  } catch (e) {
    console.error("Failed to load dashboard data:", e);
  }
}

function renderHistoricalTrend() {
  const labels = Object.keys(rawData).filter(k => k !== 'May 2026');
  const values = labels.map(k => rawData[k].total_sales || 0);

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales (₦)',
        data: values,
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        hoverBackgroundColor: 'rgba(29, 78, 216, 1)',
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => 'Sales: ' + formatNaira(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => '₦' + (v / 1000000).toFixed(1) + 'M',
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: {
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }
          },
          grid: { display: false }
        }
      }
    }
  });
}

function renderSelectedMonth() {
  const sel = document.getElementById('monthSelect').value;
  const monthData = rawData[sel];
  if (!monthData) return;

  document.getElementById('tablePeriodLabel').textContent = `${monthData.period_from} - ${monthData.period_to}`;
  document.getElementById('kpiTotalRevenue').textContent = formatNaira(monthData.total_sales);

  // MoM Growth comparison in simple plain English
  const months = Object.keys(rawData);
  const currIdx = months.indexOf(sel);
  const badge = document.getElementById('kpiGrowthBadge');
  if (currIdx > 0) {
    const prevMonth = months[currIdx - 1];
    const prevTotal = rawData[prevMonth].total_sales || 0;
    if (prevTotal > 0) {
      const diff = ((monthData.total_sales - prevTotal) / prevTotal) * 100;
      const isUp = diff >= 0;
      badge.className = `mt-2.5 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${isUp ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-rose-700 bg-rose-50 border border-rose-100'}`;
      badge.textContent = `${isUp ? '▲ +' : '▼ '}${Math.abs(diff).toFixed(1)}% ${isUp ? 'higher than' : 'lower than'} ${prevMonth}`;
    } else {
      badge.className = 'mt-2.5 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-slate-600 bg-slate-100';
      badge.textContent = 'First recorded month';
    }
  } else {
    badge.className = 'mt-2.5 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-slate-600 bg-slate-100';
    badge.textContent = 'First recorded month';
  }

  // Active accounts
  const activeCustomers = monthData.customers.filter(c => c.amount > 0);
  document.getElementById('kpiActiveAccounts').textContent = activeCustomers.length;

  // Top customer
  if (monthData.customers.length > 0 && monthData.customers[0].amount > 0) {
    const top = monthData.customers[0];
    document.getElementById('kpiTopAccountName').textContent = top.name;
    document.getElementById('kpiTopAccountShare').textContent = `${top.share_pct}% of total sales (${formatNaira(top.amount)})`;
  } else {
    document.getElementById('kpiTopAccountName').textContent = 'None';
    document.getElementById('kpiTopAccountShare').textContent = 'No sales made';
  }

  // Avg per account
  const avg = activeCustomers.length > 0 ? (monthData.total_sales / activeCustomers.length) : 0;
  document.getElementById('kpiAvgPerAccount').textContent = formatNaira(avg);

  // Render Distribution Chart
  renderDistributionChart(monthData);

  // Render Table
  const tbody = document.getElementById('customerTableBody');
  tbody.innerHTML = '';
  monthData.customers.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition duration-150';
    tr.innerHTML = `
      <td class="px-3 sm:px-6 py-4 font-semibold text-slate-400 text-xs">${idx + 1}</td>
      <td class="px-3 sm:px-6 py-4 font-bold text-slate-800 break-words">${c.name}</td>
      <td class="px-3 sm:px-6 py-4 text-right font-semibold text-slate-900 whitespace-nowrap">${formatNaira(c.amount)}</td>
      <td class="px-3 sm:px-6 py-4 text-right font-medium text-slate-600 whitespace-nowrap">${c.share_pct}%</td>
      <td class="hidden sm:table-cell px-6 py-4">
        <div class="w-full max-w-[140px] bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${c.share_pct}%"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDistributionChart(monthData) {
  const top4 = monthData.customers.slice(0, 4);
  const others = monthData.customers.slice(4);
  const othersSum = others.reduce((acc, c) => acc + c.amount, 0);

  const labels = top4.map(c => c.name);
  const data = top4.map(c => c.amount);

  if (othersSum > 0) {
    labels.push('All Other Customers');
    data.push(othersSum);
  }

  const ctx = document.getElementById('distributionChart').getContext('2d');
  if (distributionChartInstance) distributionChartInstance.destroy();

  distributionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#2563eb',
          '#38bdf8',
          '#818cf8',
          '#f59e0b',
          '#cbd5e1'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 12,
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }
          }
        },
        tooltip: {
          padding: 12,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatNaira(ctx.raw)}`
          }
        }
      },
      cutout: '72%'
    }
  });
}

async function refreshFromERP() {
  const btn = document.getElementById('refreshBtn');
  const text = document.getElementById('syncText');
  const icon = document.getElementById('syncIcon');
  
  btn.disabled = true;
  text.textContent = 'Updating...';
  icon.classList.add('animate-spin');

  try {
    const res = await fetch('/api/refresh');
    const result = await res.json();
    if (result.status === 'ok') {
      await initDashboard();
      text.textContent = 'Updated!';
      setTimeout(() => { text.textContent = 'Update Numbers'; }, 2000);
    } else {
      alert('Could not update: ' + result.message);
      text.textContent = 'Update Numbers';
    }
  } catch (e) {
    alert('Update error: ' + e);
    text.textContent = 'Update Numbers';
  } finally {
    btn.disabled = false;
    icon.classList.remove('animate-spin');
  }
}

window.onload = initDashboard;

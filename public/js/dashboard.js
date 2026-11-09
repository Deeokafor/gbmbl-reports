let rawData = {};
let trendChartInstance = null;
let distributionChartInstance = null;
let currentTableView = 'sales';

function formatNaira(num) {
  return '₦' + Number(num || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortNaira(num) {
  const n = Number(num || 0);
  if (Math.abs(n) >= 1000000) {
    return '₦' + (n / 1000000).toFixed(2) + 'M';
  } else if (Math.abs(n) >= 1000) {
    return '₦' + (n / 1000).toFixed(0) + 'k';
  }
  return '₦' + n.toLocaleString();
}

async function initDashboard() {
  try {
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

  // 1. Total Revenue & MoM Growth
  document.getElementById('kpiTotalRevenue').textContent = formatNaira(monthData.total_sales);
  const months = Object.keys(rawData);
  const currIdx = months.indexOf(sel);
  const badge = document.getElementById('kpiGrowthBadge');
  if (currIdx > 0) {
    const prevMonth = months[currIdx - 1];
    const prevTotal = rawData[prevMonth].total_sales || 0;
    if (prevTotal > 0) {
      const diff = ((monthData.total_sales - prevTotal) / prevTotal) * 100;
      const isUp = diff >= 0;
      badge.className = `mt-3 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${isUp ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-rose-700 bg-rose-50 border border-rose-100'}`;
      badge.textContent = `${isUp ? '▲ +' : '▼ '}${Math.abs(diff).toFixed(1)}% ${isUp ? 'higher than' : 'lower than'} ${prevMonth}`;
    } else {
      badge.className = 'mt-3 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-slate-600 bg-slate-100';
      badge.textContent = 'First recorded month';
    }
  } else {
    badge.className = 'mt-3 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-slate-600 bg-slate-100';
    badge.textContent = 'First recorded month';
  }

  // 2. Profit & Loss (Take-Home Profit)
  const pnl = monthData.pnl || { net_profit: 0, profit_margin: 0, cost_of_goods: 0, operating_expenses: 0, gross_profit: 0 };
  document.getElementById('kpiNetProfit').textContent = formatNaira(pnl.net_profit);
  document.getElementById('kpiProfitMarginBadge').textContent = `${pnl.profit_margin}% of sales kept`;

  // Visual Profit Bar
  const totalRev = monthData.total_sales || 1;
  const stockPct = Math.min(100, Math.max(0, (pnl.cost_of_goods / totalRev) * 100));
  const adminPct = Math.min(100, Math.max(0, (pnl.operating_expenses / totalRev) * 100));
  const profitPct = Math.min(100, Math.max(0, (pnl.net_profit / totalRev) * 100));

  document.getElementById('barStockCost').style.width = stockPct + '%';
  document.getElementById('barAdminCost').style.width = adminPct + '%';
  document.getElementById('barProfit').style.width = profitPct + '%';

  document.getElementById('lblStockCost').textContent = formatShortNaira(pnl.cost_of_goods);
  document.getElementById('lblAdminCost').textContent = formatShortNaira(pnl.operating_expenses);
  document.getElementById('lblProfit').textContent = formatShortNaira(pnl.net_profit);

  const grossMarginPct = totalRev > 0 ? (((totalRev - pnl.cost_of_goods) / totalRev) * 100).toFixed(1) : '0';
  document.getElementById('lblGrossMargin').textContent = `${grossMarginPct}% (${formatShortNaira(pnl.gross_profit)})`;

  // 3. Debtors (Money Owed To Us)
  const debtors = monthData.debtors || { total_debtors: 0, current: 0, days_1_30: 0, days_31_60: 0, over_60: 0, customers: [] };
  document.getElementById('kpiTotalDebtors').textContent = formatNaira(debtors.total_debtors);
  
  const urgentDebt = (debtors.days_31_60 || 0) + (debtors.over_60 || 0);
  if (urgentDebt > 0) {
    document.getElementById('kpiDebtorsBadge').textContent = `⚠ ${formatShortNaira(urgentDebt)} overdue >30 days`;
    document.getElementById('kpiDebtorsBadge').className = 'mt-3 inline-flex items-center text-xs font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md';
  } else {
    document.getElementById('kpiDebtorsBadge').textContent = `✓ All debts under 30 days`;
    document.getElementById('kpiDebtorsBadge').className = 'mt-3 inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md';
  }
  document.getElementById('lblUrgentDebts').textContent = formatNaira(urgentDebt);

  // Debtors Aging Bar
  const totDebt = debtors.total_debtors || 1;
  document.getElementById('barDebtCurrent').style.width = Math.min(100, Math.max(0, (debtors.current / totDebt) * 100)) + '%';
  document.getElementById('barDebt30').style.width = Math.min(100, Math.max(0, (debtors.days_1_30 / totDebt) * 100)) + '%';
  document.getElementById('barDebt60').style.width = Math.min(100, Math.max(0, (debtors.days_31_60 / totDebt) * 100)) + '%';
  document.getElementById('barDebtOver').style.width = Math.min(100, Math.max(0, (debtors.over_60 / totDebt) * 100)) + '%';

  document.getElementById('lblDebtCurrent').textContent = formatShortNaira(debtors.current);
  document.getElementById('lblDebt30').textContent = formatShortNaira(debtors.days_1_30);
  document.getElementById('lblDebt60').textContent = formatShortNaira(debtors.days_31_60);
  document.getElementById('lblDebtOver').textContent = formatShortNaira(debtors.over_60);

  // 4. Customers & Top Account
  const activeCustomers = monthData.customers.filter(c => c.amount > 0);
  document.getElementById('kpiActiveAccounts').textContent = `${activeCustomers.length} Accounts`;
  if (monthData.customers.length > 0 && monthData.customers[0].amount > 0) {
    const top = monthData.customers[0];
    document.getElementById('kpiTopAccountShare').textContent = `Top: ${top.name} (${top.share_pct}%)`;
  } else {
    document.getElementById('kpiTopAccountShare').textContent = 'No sales made';
  }

  // 5. Render Distribution Doughnut
  renderDistributionChart(monthData);

  // 6. Render Tables (Sales & Debtors)
  renderSalesTable(monthData);
  renderDebtorsTable(debtors);
}

function renderSalesTable(monthData) {
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

function renderDebtorsTable(debtors) {
  const tbody = document.getElementById('debtorsTableBody');
  tbody.innerHTML = '';
  if (!debtors.customers || debtors.customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">No outstanding customer debts recorded for this period.</td></tr>';
    return;
  }
  debtors.customers.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-amber-50/20 transition duration-150';
    const overdue30 = (c.days_31_60 || 0) + (c.over_60 || 0);
    const isCritical = (c.over_60 || 0) > 0;
    const isWarning = overdue30 > 0 && !isCritical;
    
    let urgencyBadge = '<span class="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Fresh (&lt;30d)</span>';
    if (isCritical) {
      urgencyBadge = '<span class="inline-flex items-center text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">Overdue &gt;60d</span>';
    } else if (isWarning) {
      urgencyBadge = '<span class="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">31-60d Due</span>';
    }

    tr.innerHTML = `
      <td class="px-3 sm:px-6 py-4 font-semibold text-slate-400 text-xs">${idx + 1}</td>
      <td class="px-3 sm:px-6 py-4 font-bold text-slate-800 break-words">${c.name}</td>
      <td class="px-3 sm:px-6 py-4 text-right font-bold text-slate-900 whitespace-nowrap">${formatNaira(c.total_owed)}</td>
      <td class="px-3 sm:px-6 py-4 text-right font-semibold ${overdue30 > 0 ? 'text-amber-700' : 'text-slate-400'} whitespace-nowrap">${formatNaira(overdue30)}</td>
      <td class="px-3 sm:px-6 py-4 text-center">${urgencyBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function setTableView(view) {
  currentTableView = view;
  const salesView = document.getElementById('tableSalesView');
  const debtorsView = document.getElementById('tableDebtorsView');
  const btnSales = document.getElementById('viewBtnSales');
  const btnDebtors = document.getElementById('viewBtnDebtors');

  if (view === 'sales') {
    salesView.classList.remove('hidden');
    debtorsView.classList.add('hidden');
    btnSales.className = 'text-xs font-bold px-3 py-1.5 rounded-md bg-white text-slate-900 shadow-sm transition';
    btnDebtors.className = 'text-xs font-semibold px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 transition';
  } else {
    salesView.classList.add('hidden');
    debtorsView.classList.remove('hidden');
    btnDebtors.className = 'text-xs font-bold px-3 py-1.5 rounded-md bg-white text-amber-900 shadow-sm transition';
    btnSales.className = 'text-xs font-semibold px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 transition';
  }
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
      setTimeout(() => { text.textContent = 'Sync ERP'; }, 2000);
    } else {
      alert('Could not update: ' + result.message);
      text.textContent = 'Sync ERP';
    }
  } catch (e) {
    alert('Update error: ' + e);
    text.textContent = 'Sync ERP';
  } finally {
    btn.disabled = false;
    icon.classList.remove('animate-spin');
  }
}

window.onload = initDashboard;

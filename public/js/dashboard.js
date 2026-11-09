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

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
        backgroundColor: '#2563eb',
        hoverBackgroundColor: '#1d4ed8',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#09090b',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 'bold' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => ' Sales: ' + formatNaira(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => '₦' + (v / 1000000).toFixed(1) + 'M',
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
            color: '#71717a'
          },
          grid: { color: '#f4f4f5' },
          border: { dash: [4, 4] }
        },
        x: {
          ticks: {
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
            color: '#71717a'
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
      badge.className = `inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${isUp ? 'text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20' : 'text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-600/20'}`;
      badge.textContent = `${isUp ? '▲ +' : '▼ '}${Math.abs(diff).toFixed(1)}% vs ${prevMonth.split(' ')[0]}`;
    } else {
      badge.className = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-zinc-600 bg-zinc-100 ring-1 ring-inset ring-zinc-500/10';
      badge.textContent = 'First month';
    }
  } else {
    badge.className = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-zinc-600 bg-zinc-100 ring-1 ring-inset ring-zinc-500/10';
    badge.textContent = 'First month';
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
    document.getElementById('kpiDebtorsBadge').textContent = `⚠ ${formatShortNaira(urgentDebt)} >30d overdue`;
    document.getElementById('kpiDebtorsBadge').className = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/20';
  } else {
    document.getElementById('kpiDebtorsBadge').textContent = `✓ All debts current`;
    document.getElementById('kpiDebtorsBadge').className = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20';
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
    document.getElementById('kpiTopAccountShare').textContent = `Top account: ${top.name} (${top.share_pct}%)`;
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
    tr.className = 'hover:bg-zinc-50 transition-colors duration-150';
    
    // Rank badge styling
    let rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-zinc-100 text-zinc-600 font-semibold text-xs">${idx + 1}</span>`;
    if (idx === 0) {
      rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-800 font-bold text-xs ring-1 ring-inset ring-amber-600/20">1</span>`;
    } else if (idx === 1) {
      rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-200 text-slate-800 font-bold text-xs ring-1 ring-inset ring-slate-400/20">2</span>`;
    } else if (idx === 2) {
      rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-100 text-orange-800 font-bold text-xs ring-1 ring-inset ring-orange-600/20">3</span>`;
    }

    const initials = getInitials(c.name);

    tr.innerHTML = `
      <td class="px-4 sm:px-6 py-4">${rankBadge}</td>
      <td class="px-4 sm:px-6 py-4">
        <div class="flex items-center space-x-3">
          <span class="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-zinc-100 text-zinc-700 font-bold text-xs shrink-0 ring-1 ring-inset ring-zinc-950/5">
            ${initials}
          </span>
          <div class="min-w-0">
            <p class="font-semibold text-zinc-950 truncate">${c.name}</p>
            <p class="text-xs text-zinc-500 font-normal">Customer Account</p>
          </div>
        </div>
      </td>
      <td class="px-4 sm:px-6 py-4 text-right font-semibold text-zinc-950 tabular-nums whitespace-nowrap">${formatNaira(c.amount)}</td>
      <td class="px-4 sm:px-6 py-4 text-right font-medium text-zinc-600 tabular-nums whitespace-nowrap">${c.share_pct}%</td>
      <td class="hidden sm:table-cell px-6 py-4">
        <div class="w-full max-w-[140px] bg-zinc-100 rounded-full h-2 overflow-hidden ring-1 ring-inset ring-zinc-950/5">
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
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-zinc-500">No outstanding customer debts recorded for this period.</td></tr>';
    return;
  }
  debtors.customers.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-zinc-50 transition-colors duration-150';
    const overdue30 = (c.days_31_60 || 0) + (c.over_60 || 0);
    const isCritical = (c.over_60 || 0) > 0;
    const isWarning = overdue30 > 0 && !isCritical;
    
    let urgencyBadge = '<span class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Fresh (&lt;30d)</span>';
    if (isCritical) {
      urgencyBadge = '<span class="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">Overdue &gt;60d</span>';
    } else if (isWarning) {
      urgencyBadge = '<span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">31-60d Due</span>';
    }

    const initials = getInitials(c.name);

    tr.innerHTML = `
      <td class="px-4 sm:px-6 py-4 font-semibold text-zinc-400 text-xs">${idx + 1}</td>
      <td class="px-4 sm:px-6 py-4">
        <div class="flex items-center space-x-3">
          <span class="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-zinc-100 text-zinc-700 font-bold text-xs shrink-0 ring-1 ring-inset ring-zinc-950/5">
            ${initials}
          </span>
          <div class="min-w-0">
            <p class="font-semibold text-zinc-950 truncate">${c.name}</p>
            <p class="text-xs text-zinc-500 font-normal">Customer Account</p>
          </div>
        </div>
      </td>
      <td class="px-4 sm:px-6 py-4 text-right font-semibold text-zinc-950 tabular-nums whitespace-nowrap">${formatNaira(c.total_owed)}</td>
      <td class="px-4 sm:px-6 py-4 text-right font-semibold ${overdue30 > 0 ? 'text-amber-700' : 'text-zinc-400'} tabular-nums whitespace-nowrap">${formatNaira(overdue30)}</td>
      <td class="px-4 sm:px-6 py-4 text-center">${urgencyBadge}</td>
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
    btnSales.className = 'text-xs font-semibold px-3 py-1.5 rounded-md bg-white text-zinc-950 shadow-xs transition';
    btnDebtors.className = 'text-xs font-medium px-3 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 transition';
  } else {
    salesView.classList.add('hidden');
    debtorsView.classList.remove('hidden');
    btnDebtors.className = 'text-xs font-semibold px-3 py-1.5 rounded-md bg-white text-zinc-950 shadow-xs transition';
    btnSales.className = 'text-xs font-medium px-3 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 transition';
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
          '#0284c7',
          '#6366f1',
          '#f59e0b',
          '#e4e4e7'
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
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            padding: 12,
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
            color: '#52525b'
          }
        },
        tooltip: {
          backgroundColor: '#09090b',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 'bold' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
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
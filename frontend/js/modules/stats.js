
const StatsModule = {
    charts: {},

    init: async () => {
        // Ensure data exists
        if (!window.appData?.plan) {
            await PlanModule.loadData();
        }
        const plan = window.appData.plan || [];

        // Also fetch milestones specifically if needed, but let's count from plan for now or fetch
        // For Hitos Total, we can fetch /hitos count or assume. Let's fetch to be accurate.
        let hitosCount = 0;
        try {
            const hRes = await API.get('/hitos'); // Assuming endpoint returns all
            hitosCount = hRes ? hRes.length : 0;
        } catch (e) { console.log('Error fetching hitos stats'); }

        StatsModule.renderKPIs(plan, hitosCount);
        StatsModule.renderCharts(plan);
        StatsModule.renderUpcoming(plan);
    },

    renderKPIs: (data, hitosCount) => {
        const total = data.length;
        const done = data.filter(i => i.status === 'COMPLETADO' || i.status === 'FINALIZADO').length;
        const process = data.filter(i => i.status === 'EN PROGRESO').length;

        // Animating Numbers
        Utils.animateValue('kpiTotal', 0, total, 1000);
        Utils.animateValue('kpiDone', 0, done, 1000);
        Utils.animateValue('kpiProcess', 0, process, 1000);
        Utils.animateValue('kpiMilestones', 0, hitosCount, 1000);
    },

    renderCharts: (data) => {
        // 1. Status Chart (Doughnut)
        const statusCounts = {};
        data.forEach(i => {
            const s = i.status || 'PENDIENTE';
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        const ctxStatus = document.getElementById('chartStatus');
        if (ctxStatus) {
            if (StatsModule.charts.status) StatsModule.charts.status.destroy();

            StatsModule.charts.status = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        data: Object.values(statusCounts),
                        backgroundColor: ['#e2e8f0', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: 'Outfit' } } }
                    },
                    cutout: '70%'
                }
            });
        }


        // 2. Product/Component Chart (Bar)
        // Group by product/component (extract from task_name or a field)
        // Assuming 'product_name' isn't explicitly available, we might group by 'activity_code' prefix or similar.
        // Actually, let's group by RESPONSABLE for better utility? Or 'product_code' if available.
        // The endpoint returns `product_code`.

        const prodCounts = {};
        data.forEach(i => {
            // Simplify Product Code (e.g., '1.1' from '1.1 | Coord...')
            let p = i.product_code || 'General';
            // Try to make it shorter
            if (p.includes('|')) p = p.split('|')[0].trim();

            prodCounts[p] = (prodCounts[p] || 0) + 1;
        });

        const ctxProd = document.getElementById('chartProduct');
        if (ctxProd) {
            if (StatsModule.charts.prod) StatsModule.charts.prod.destroy();

            StatsModule.charts.prod = new Chart(ctxProd, {
                type: 'bar',
                data: {
                    labels: Object.keys(prodCounts),
                    datasets: [{
                        label: 'Actividades',
                        data: Object.values(prodCounts),
                        backgroundColor: '#4f46e5',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [2, 2] } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }
    },

    renderUpcoming: (data) => {
        const container = document.getElementById('statsUpcoming');
        if (!container) return;

        // Filter: End date in next 30 days && Not Completed
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + 30);

        const upcoming = data.filter(i => {
            if (!i.end_date) return false;
            if (i.status === 'COMPLETADO') return false;
            const d = new Date(i.end_date);
            return d >= now && d <= future;
        }).sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

        if (upcoming.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-slate-400 text-sm">No hay vencimientos próximos.</div>';
            return;
        }

        container.innerHTML = upcoming.slice(0, 5).map(i => ` // Top 5
            <div class="px-6 py-4 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center font-bold text-xs">
                        ${new Date(i.end_date).getDate()}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-slate-700 line-clamp-1">${i.task_name}</div>
                        <div class="text-xs text-slate-400 flex gap-2">
                             <span>${i.activity_code}</span>
                             <span>•</span>
                             <span>${i.responsable || 'Sin asignar'}</span>
                        </div>
                    </div>
                </div>
                <div class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    ${Utils.formatDate(i.end_date)}
                </div>
            </div>
        `).join('');
    }
};

// Utils Extension (if animateValue missing)
if (!Utils.animateValue) {
    Utils.animateValue = (id, start, end, duration) => {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    };
}

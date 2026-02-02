
const CalendarModule = {
    events: [],
    currentView: 'month',

    init: async () => {
        // Fetch Data
        const [plan, hitos] = await Promise.all([
            API.get('/plan-maestro'),
            API.get('/hitos')
        ]);

        const events = [];

        // Process Plan Activities (End Dates)
        if (plan && Array.isArray(plan)) {
            plan.forEach(p => {
                if (p.fecha_fin) {
                    events.push({
                        date: new Date(p.fecha_fin),
                        title: p.task_name,
                        code: p.activity_code,
                        type: 'entrega', // classification
                        original: p
                    });
                }
            });
        }

        // Process Hitos
        if (hitos && Array.isArray(hitos)) {
            hitos.forEach(h => {
                if (h.fecha_estimada) {
                    events.push({
                        date: new Date(h.fecha_estimada),
                        title: h.nombre,
                        code: h.activity_code || 'HITO',
                        type: 'hito',
                        original: h
                    });
                }
            });
        }

        // Sort by Date Ascending
        events.sort((a, b) => a.date - b.date);
        CalendarModule.events = events;

        CalendarModule.render('month');
    },

    render: (view = 'month') => {
        CalendarModule.currentView = view;
        const container = document.getElementById('calendarView');
        if (!container) return;

        // Toggle Buttons State
        const btnMonth = document.getElementById('btnCalMonth');
        const btnAgenda = document.getElementById('btnCalAgenda');

        if (view === 'month') {
            btnMonth?.classList.replace('btn-secondary', 'btn-primary');
            btnAgenda?.classList.replace('btn-primary', 'btn-secondary');
            CalendarModule.renderMonthView(container);
        } else {
            btnAgenda?.classList.replace('btn-secondary', 'btn-primary');
            btnMonth?.classList.replace('btn-primary', 'btn-secondary');
            CalendarModule.renderAgendaView(container);
        }
    },

    renderMonthView: (container) => {
        if (CalendarModule.events.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-slate-500">No hay hitos ni fechas programadas.</div>';
            return;
        }

        // Group by Month (YYYY-MM to sort correctly)
        const groups = {};
        CalendarModule.events.forEach(e => {
            const key = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(e);
        });

        // Grid Layout
        let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:1.5rem;">';

        Object.keys(groups).sort().forEach(key => { // ISO keys sort correctly
            const monthEvents = groups[key];
            const dateObj = monthEvents[0].date;
            // Use UTC timezone for display
            const monthName = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

            html += `
                <div style="background:white; border:1px solid #e2e8f0; border-radius:1rem; padding:1.5rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <h3 style="font-weight:700; font-size:1.1rem; margin:0 0 1rem 0; text-transform:capitalize; color:#1e293b; padding-bottom:0.75rem; border-bottom:2px solid #f1f5f9;">
                        ${monthName}
                    </h3>
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        ${monthEvents.map(e => CalendarModule.renderCard(e)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    renderAgendaView: (container) => {
        if (CalendarModule.events.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-slate-500">No hay hitos ni fechas programadas.</div>';
            return;
        }

        // List Layout Day by Day
        // Group by Day
        const days = {};
        CalendarModule.events.forEach(e => {
            const key = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, '0')}-${String(e.date.getUTCDate()).padStart(2, '0')}`;
            if (!days[key]) days[key] = [];
            days[key].push(e);
        });

        let html = '<div style="max-width: 800px; margin: 0 auto; display:flex; flex-direction:column; gap:1rem;">';

        Object.keys(days).sort().forEach(dayKey => {
            const dayEvents = days[dayKey];
            const dateObj = dayEvents[0].date;

            // Format: "Lunes, 25 de Enero" (Using UTC)
            const dayLabel = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
            // Secondary format also UTC
            const shortDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

            html += `
                <div style="display:flex; gap:1.5rem;">
                     <div style="flex:0 0 120px; text-align:right; padding-top:1rem;">
                        <div style="font-weight:700; text-transform:capitalize; font-size:1rem; color:#334155;">${dayLabel.split(',')[0]}</div>
                        <div style="font-size:0.9rem; color:#64748b;">${shortDate}</div>
                     </div>
                     
                     <div style="flex:1; border-left: 2px solid #e2e8f0; padding-left:1.5rem; padding-bottom:1.5rem;">
                         <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">
                            ${dayEvents.map(e => CalendarModule.renderCard(e, true)).join('')}
                         </div>
                     </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    // Shared Card Component
    renderCard: (e, isAgenda = false) => {
        const isHito = e.type === 'hito';
        const color = isHito ? '#8b5cf6' : '#2563eb'; // Violet for Hito, Blue for Entregas
        const bgColor = isHito ? '#f5f3ff' : '#eff6ff';
        const icon = isHito ? '<i class="fas fa-flag"></i>' : '<i class="fas fa-check-circle"></i>';

        return `
            <div style="background:${bgColor}; border-left:4px solid ${color}; padding:0.75rem; border-radius:0.5rem; display:flex; gap:0.75rem; align-items:flex-start;">
                <div style="color:${color}; margin-top:2px;">${icon}</div>
                <div>
                     <div style="font-size:0.75rem; font-weight:700; color:${color}; margin-bottom:2px;">
                        ${isAgenda ? '' : `Día ${e.date.getUTCDate()} - `} ${e.code || 'S/C'}
                     </div>
                     <div style="font-size:0.9rem; font-weight:600; color:#1e293b; line-height:1.2;">${e.title}</div>
                     <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${isHito ? 'Hito Importante' : 'Entrega Actividad'}</div>
                </div>
            </div>
        `;
    }
};

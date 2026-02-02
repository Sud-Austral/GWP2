
const HitosModule = {
    data: [],
    editingId: null,

    init: async () => {
        const data = await API.get('/hitos');
        HitosModule.data = data || [];

        Utils.setupCascadingFilters({
            data: HitosModule.data,
            filters: [
                { id: 'hitoFilterProduct', key: 'product_code' },
                { id: 'hitoFilterStatus', key: 'estado' }
            ],
            onFilter: (filtered) => {
                HitosModule.render(filtered);
            }
        });

        HitosModule.setupEvents();
    },

    setupEvents: () => {
        const btn = document.getElementById('btnNewHitoGlobal');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => HitosModule.openModal());
        }

        const form = document.getElementById('hitoGlobalForm');
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            newForm.addEventListener('submit', HitosModule.save);
        }
    },

    render: (data) => {
        const tbody = document.getElementById('hitosTableBody');
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-slate-400 italic">No hay hitos registrados con los filtros actuales.</td></tr>';
            return;
        }

        data.forEach(h => {
            const tr = document.createElement('tr');

            let statusClass = 'badge badge-gray';
            if (h.estado === 'Completado') statusClass = 'badge badge-green';
            else if (h.estado === 'Pendiente') statusClass = 'badge badge-yellow';

            tr.innerHTML = `
                <td>
                    <div style="font-weight:700; color:#334155;">${h.nombre}</div>
                    <div style="font-size:0.85rem; color:#94a3b8;">${h.descripcion || ''}</div>
                </td>
                <td style="font-weight:500; color:#64748b;">${Utils.formatDate(h.fecha_estimada)}</td>
                <td>
                    <div class="font-bold text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded inline-block mb-1">${h.activity_code || '-'}</div>
                    <div style="font-size:0.8rem; color:#475569; font-weight:500;">${h.task_name || ''}</div>
                </td>
                 <td>
                    <span class="${statusClass}">
                        ${h.estado || 'Pendiente'}
                    </span>
                 </td>
                 <td>
                    <div class="flex gap-2">
                        <button class="btn-icon text-blue-600" onclick="HitosModule.openModal(${h.id})" title="Editar">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                         <button class="btn-icon text-red-500" onclick="HitosModule.delete(${h.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openModal: async (id = null) => {
        HitosModule.editingId = id;

        // Reset Form
        document.getElementById('hitoGlobalName').value = '';
        document.getElementById('hitoGlobalDate').value = '';
        document.getElementById('hitoGlobalDesc').value = '';

        // Try to change title if possible, though simple modal might not have id for title
        const modal = document.getElementById('hitoGlobalModal');
        const title = modal.querySelector('h3') || modal.querySelector('h2');
        if (title) title.textContent = id ? 'Editar Hito' : 'Nuevo Hito';

        // Load Plans for Select
        const select = document.getElementById('hitoPlanSelect');
        select.innerHTML = '<option value="">Cargando...</option>';
        const plans = await API.get('/plan-maestro');

        select.innerHTML = '<option value="">Seleccione Actividad...</option>';
        if (plans) {
            plans.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const name = p.task_name.length > 50 ? p.task_name.substring(0, 50) + '...' : p.task_name;
                opt.textContent = `${p.activity_code} - ${name}`;
                select.appendChild(opt);
            });
        }

        // If Editing, Fill Data
        if (id) {
            const hito = HitosModule.data.find(h => h.id === id);
            if (hito) {
                document.getElementById('hitoGlobalName').value = hito.nombre;
                document.getElementById('hitoGlobalDate').value = Utils.formatDateForInput(hito.fecha_estimada);
                document.getElementById('hitoGlobalDesc').value = hito.descripcion || '';
                select.value = hito.plan_maestro_id;
            }
        }

        Utils.openModal('hitoGlobalModal');
    },

    delete: async (id) => {
        if (!confirm('¿Eliminar hito permanentemente?')) return;
        try {
            await API.delete(`/hitos/${id}`);
            HitosModule.init(); // Refresh list
        } catch (e) { alert('Error eliminando'); }
    },

    save: async (e) => {
        e.preventDefault();
        const planId = document.getElementById('hitoPlanSelect').value;
        const nombre = document.getElementById('hitoGlobalName').value;
        const fecha = document.getElementById('hitoGlobalDate').value;
        const desc = document.getElementById('hitoGlobalDesc').value;

        if (!planId) { alert("Debe seleccionar una actividad"); return; }

        const payload = {
            plan_maestro_id: planId,
            nombre: nombre,
            fecha_estimada: fecha || null,
            descripcion: desc,
            // Status is not in create modal usually, defaulting to existing or Pendiente
            estado: HitosModule.editingId ? (HitosModule.data.find(h => h.id === HitosModule.editingId)?.estado) : 'Pendiente'
        };

        try {
            if (HitosModule.editingId) {
                await API.put(`/hitos/${HitosModule.editingId}`, payload);
            } else {
                await API.post('/hitos', payload);
            }
            Utils.closeModal('hitoGlobalModal');
            HitosModule.init();
        } catch (e) { alert("Error guardando hito"); }
    }
};

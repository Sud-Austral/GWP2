
const DocumentsModule = {
    data: [],

    init: async () => {
        const data = await API.get('/documentos');
        DocumentsModule.data = data || [];

        // Cascading Filters
        Utils.setupCascadingFilters({
            data: DocumentsModule.data,
            filters: [
                { id: 'docFilterProduct', key: 'product_code' },
                { id: 'docFilterResp', key: 'uploader' }
            ],
            onFilter: (filtered) => {
                DocumentsModule.render(filtered);
            }
        });

        DocumentsModule.setupEvents();
    },

    applyFilters: () => {
        const fProd = document.getElementById('docFilterProduct')?.value.toLowerCase();
        const fResp = document.getElementById('docFilterResp')?.value.toLowerCase();

        const filtered = DocumentsModule.data.filter(d => {
            const mProd = !fProd || (d.product_code || d.activity_code || '').toLowerCase().includes(fProd);
            const mResp = !fResp || (d.uploader || '').toLowerCase().includes(fResp);
            return mProd && mResp;
        });

        DocumentsModule.render(filtered);
    },

    setupEvents: () => {
        const btn = document.getElementById('btnNewDocGlobal');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', DocumentsModule.openModal);
        }

        const form = document.getElementById('docGlobalForm');
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            newForm.addEventListener('submit', DocumentsModule.upload);
        }
    },

    render: (data) => {
        const tbody = document.getElementById('docsTableBody');
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-slate-400 italic">No hay documentos con los filtros actuales.</td></tr>';
            return;
        }

        data.forEach(d => {
            const tr = document.createElement('tr');

            const isPdf = d.nombre_archivo.toLowerCase().endsWith('.pdf');
            const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(d.nombre_archivo);

            let iconClass = 'fa-file';
            let iconColor = 'text-slate-400';
            if (isPdf) { iconClass = 'fa-file-pdf'; iconColor = 'text-red-500'; }
            else if (isImg) { iconClass = 'fa-file-image'; iconColor = 'text-purple-500'; }
            else if (/\.(xls|xlsx|csv)$/i.test(d.nombre_archivo)) { iconClass = 'fa-file-excel'; iconColor = 'text-green-500'; }
            else if (/\.(doc|docx)$/i.test(d.nombre_archivo)) { iconClass = 'fa-file-word'; iconColor = 'text-blue-500'; }

            const url = `${API.BASE}/uploads/${d.ruta_archivo}`;

            tr.innerHTML = `
                <td>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <i class="fas ${iconClass} ${iconColor} text-lg"></i>
                        </div>
                        <div class="font-semibold text-slate-700 text-sm">${d.nombre_archivo}</div>
                    </div>
                </td>
                <td>
                     <div class="text-sm text-slate-600 font-medium">${d.task_name || d.activity_code || '<span class="text-slate-300 italic">Global</span>'}</div>
                </td>
                <td>
                    <div class="flex items-center gap-2">
                         <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                            ${(d.uploader || '?').substring(0, 1).toUpperCase()}
                         </div>
                         <span class="text-sm text-slate-600">${d.uploader || '-'}</span>
                    </div>
                </td>
                <td>
                    <span class="text-sm text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        ${Utils.formatDate(d.created_at)}
                    </span>
                </td>
                <td>
                    <div class="flex gap-2">
                        <a href="${url}" target="_blank" class="btn-icon text-blue-600" title="Descargar" download>
                            <i class="fas fa-download"></i>
                        </a>
                        ${(isPdf || isImg) ? `
                        <button class="btn-icon text-purple-600" onclick="Utils.previewFile('${url}', '${d.nombre_archivo}')" title="Vista Previa">
                            <i class="fas fa-eye"></i>
                        </button>` : ''}
                        
                         <button class="btn-icon text-red-500" onclick="DocumentsModule.delete(${d.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    delete: async (docId) => {
        if (!confirm("¿Está seguro de eliminar este documento? Esta acción no se puede deshacer.")) return;

        const res = await API.delete(`/documentos/${docId}`);
        if (res && res.message) {
            // Force refresh to update list and potential status in Plan
            DocumentsModule.init();
        } else {
            alert('Error al eliminar: ' + (res?.error || 'Desconocido'));
        }
    },

    openModal: async () => {
        const select = document.getElementById('docPlanSelect');
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

        document.getElementById('docGlobalFile').value = '';
        Utils.openModal('docGlobalModal');
    },

    upload: async (e) => {
        e.preventDefault();
        const planId = document.getElementById('docPlanSelect').value;
        const fileInput = document.getElementById('docGlobalFile');
        const file = fileInput.files[0];

        if (!planId || !file) {
            alert("Seleccione actividad y archivo");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('plan_id', planId);

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API.BASE}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const json = await res.json();

            if (res.ok) {
                Utils.closeModal('docGlobalModal');
                DocumentsModule.init(); // Reload
            } else {
                alert("Error: " + json.error);
            }
        } catch (err) {
            alert("Error de red");
        }
    },

    preview: (url) => {
        let modal = document.getElementById('previewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'previewModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 90%; height: 90vh; display:flex; flex-direction:column;">
                    <header class="modal-header">
                        <h2 class="modal-title">Vista Previa</h2>
                        <button class="close-btn" onclick="document.getElementById('previewModal').classList.remove('show')">&times;</button>
                    </header>
                    <div style="flex:1; background:#eee;">
                         <iframe id="previewFrame" style="width:100%; height:100%; border:none;"></iframe>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        document.getElementById('previewFrame').src = url;
        modal.classList.add('show');
    }
};

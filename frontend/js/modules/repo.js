
const RepoModule = {
    data: [],

    init: async () => {
        await RepoModule.loadData();
        RepoModule.setupEvents();
        RepoModule.setupFilters();
    },

    loadData: async () => {
        const container = document.getElementById('repoGrid');
        if (container) container.innerHTML = '<div class="text-center p-8 text-slate-400">Cargando repositorio...</div>';

        try {
            const data = await API.get('/repositorio');
            RepoModule.data = data || [];
            RepoModule.render(RepoModule.data);

        } catch (e) {
            console.error(e);
            if (container) container.innerHTML = '<div class="text-red-500 text-center">Error cargando repositorio</div>';
        }
    },

    setupFilters: () => {
        const searchInput = document.getElementById('searchRepo');
        const typeSelect = document.getElementById('repoFilterType');

        const filter = () => {
            const s = (searchInput?.value || '').toLowerCase();
            const t = (typeSelect?.value || '').toLowerCase();

            const filtered = RepoModule.data.filter(item => {
                const matchText = (item.titulo || '').toLowerCase().includes(s) ||
                    (item.descripcion || '').toLowerCase().includes(s) ||
                    (item.etiquetas || '').toLowerCase().includes(s);

                const matchType = !t || (item.tipo_documento || '').toLowerCase().includes(t);

                return matchText && matchType;
            });
            RepoModule.render(filtered);
        };

        if (searchInput) searchInput.addEventListener('input', filter);
        if (typeSelect) typeSelect.addEventListener('change', filter);
    },

    render: (data) => {
        const container = document.getElementById('repoGrid');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center p-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                    <i class="fas fa-book-open text-4xl text-slate-300 mb-4"></i>
                    <h3 class="text-lg font-medium text-slate-600">Repositorio Vacío</h3>
                    <p class="text-slate-400 text-sm mt-1">No hay documentos que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(item => RepoModule.renderCard(item)).join('');
    },

    renderCard: (item) => {
        const isUrl = !!item.enlace_externo;
        const hasFile = !!item.ruta_archivo;

        // Colors by type
        let colorClass = 'bg-slate-100 text-slate-600 border-slate-200';
        let icon = 'fa-file-alt';

        const type = (item.tipo_documento || '').toLowerCase();
        if (type.includes('ley') || type.includes('decreto')) { colorClass = 'bg-orange-50 text-orange-600 border-orange-100'; icon = 'fa-balance-scale'; }
        else if (type.includes('técnico') || type.includes('informe')) { colorClass = 'bg-blue-50 text-blue-600 border-blue-100'; icon = 'fa-chart-pie'; }
        else if (type.includes('acta')) { colorClass = 'bg-purple-50 text-purple-600 border-purple-100'; icon = 'fa-users'; }

        // Tags
        const tags = item.etiquetas ? item.etiquetas.split(',').map(t =>
            `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">${t.trim()}</span>`
        ).join('') : '';

        // Action Buttons
        let actionBtn = '';
        if (hasFile) {
            const url = `${API.BASE}/uploads/${item.ruta_archivo}`;
            actionBtn = `<a href="${url}" target="_blank" class="btn-icon text-blue-600" title="Descargar"><i class="fas fa-download"></i></a>`;
            if (/\.(pdf|jpg|png)$/i.test(item.ruta_archivo)) {
                actionBtn += `<button onclick="Utils.previewFile('${url}', '${item.titulo}')" class="btn-icon text-indigo-600" title="Vista Previa"><i class="fas fa-eye"></i></button>`;
            }
        } else if (isUrl) {
            actionBtn = `<a href="${item.enlace_externo}" target="_blank" class="btn-icon text-blue-600" title="Abrir Enlace"><i class="fas fa-external-link-alt"></i></a>`;
        }

        return `
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200">
                <div class="p-5">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center ${colorClass} bg-opacity-50 border">
                                <i class="fas ${icon} text-lg"></i>
                            </div>
                            <div>
                                <span class="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">${item.tipo_documento || 'Documento'}</span>
                                <h3 class="font-bold text-slate-800 text-sm leading-tight line-clamp-2" title="${item.titulo}">${item.titulo}</h3>
                            </div>
                        </div>
                         <!-- Options -->
                        <div class="flex gap-2">
                            <button onclick="RepoModule.edit(${item.id})" class="text-slate-300 hover:text-blue-500 transition-colors" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                            <button onclick="RepoModule.delete(${item.id})" class="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>

                    <div class="text-xs text-slate-500 mb-4 line-clamp-3 h-[4.5em] leading-relaxed">
                        ${item.descripcion || 'Sin descripción disponible.'}
                    </div>

                    <div class="flex flex-wrap gap-1 mb-4 h-[24px] overflow-hidden">
                        ${tags}
                    </div>

                    <div class="flex items-center justify-between pt-3 border-t border-slate-50">
                        <div class="flex items-center gap-2 text-xs text-slate-400">
                            <i class="far fa-calendar"></i> ${item.fecha_publicacion ? Utils.formatDate(item.fecha_publicacion) : 'S/F'}
                            <span class="text-slate-200">|</span>
                            <span>${item.fuente_origen || 'Origen Desc.'}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            ${actionBtn}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    edit: (id) => {
        const item = RepoModule.data.find(d => d.id === id);
        if (!item) return;

        const form = document.getElementById('repoForm');
        form.reset();

        let idInput = document.getElementById('repoId');
        if (!idInput) {
            idInput = document.createElement('input');
            idInput.type = 'hidden';
            idInput.id = 'repoId';
            form.appendChild(idInput);
        }
        idInput.value = item.id;

        Array.from(form.elements).forEach(el => {
            if (el.name && item[el.name] !== undefined && item[el.name] !== null) {
                el.value = item[el.name];
            }
        });

        const titleParams = document.querySelector('#repoModal .modal-title');
        if (titleParams) titleParams.textContent = 'Editar Documento';

        Utils.openModal('repoModal');
    },

    setupEvents: () => {
        document.getElementById('btnNewRepoDoc')?.addEventListener('click', () => {
            const form = document.getElementById('repoForm');
            form.reset();
            const idInput = document.getElementById('repoId');
            if (idInput) idInput.value = '';

            const titleParams = document.querySelector('#repoModal .modal-title');
            if (titleParams) titleParams.textContent = 'Agregar a Biblioteca';

            Utils.openModal('repoModal');
        });

        // Handle Form Submit
        const form = document.getElementById('repoForm');
        if (form) {
            // Remove listeners trick
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);

            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await RepoModule.save();
            });
        }
    },

    save: async () => {
        const form = document.getElementById('repoForm');
        const idInput = document.getElementById('repoId');
        const id = (idInput && idInput.value) ? idInput.value : null;

        if (id) {
            // PUT
            const payload = {};
            Array.from(form.elements).forEach(el => {
                if (el.name && el.name !== 'file' && el.value) payload[el.name] = el.value;
            });

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API.BASE}/repositorio/${id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();
                if (res.ok) {
                    Utils.closeModal('repoModal');
                    form.reset();
                    idInput.value = '';
                    RepoModule.loadData();
                    alert("Documento actualizado exitosamente");
                } else {
                    alert("Error: " + (json.error || 'Error desconocido'));
                }
            } catch (e) { alert("Error de conexión"); }
            return;
        }

        // POST (New)
        const formData = new FormData(form);
        if (!formData.get('fecha_publicacion')) formData.delete('fecha_publicacion');

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API.BASE}/repositorio`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const json = await res.json();

            if (res.ok) {
                Utils.closeModal('repoModal');
                form.reset();
                RepoModule.loadData();
                alert("Documento guardado exitosamente");
            } else {
                alert("Error: " + (json.error || 'Error desconocido'));
            }
        } catch (e) {
            alert("Error de conexión");
        }
    },

    delete: async (id) => {
        if (!confirm("¿Eliminar este documento del repositorio?")) return;
        try {
            await API.delete(`/repositorio/${id}`);
            RepoModule.loadData();
        } catch (e) { alert("Error eliminando"); }
    }
};

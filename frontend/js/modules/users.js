
const UsersModule = {
    init: async () => {
        UsersModule.loadUsers();
        UsersModule.setupEvents();
    },

    loadUsers: async () => {
        const data = await API.get('/usuarios');
        UsersModule.renderTable(data);
    },

    renderTable: (data) => {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">No hay usuarios.</td></tr>';
            return;
        }

        data.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.id}</td>
                <td><strong>${user.nombre}</strong></td>
                <td>${user.username}</td>
                <td>${Utils.formatDate(user.created_at)}</td>
                <td>
                     <div class="action-cell">
                        <button class="btn btn-sm btn-icon" onclick="UsersModule.edit(${user.id}, '${user.nombre}', '${user.username}')">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button class="btn btn-sm btn-icon text-red-500" onclick="UsersModule.delete(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    setupEvents: () => {
        document.getElementById('btnNewUser').addEventListener('click', () => {
            UsersModule.openModal();
        });

        document.getElementById('userForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await UsersModule.save();
        });
    },

    openModal: (id = null, name = '', username = '') => {
        document.getElementById('userId').value = id || '';
        document.getElementById('userName').value = name;
        document.getElementById('userUsername').value = username;
        document.getElementById('userPass').value = ''; // Always empty on open

        document.getElementById('userModalTitle').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';
        Utils.openModal('userModal');
    },

    edit: (id, name, username) => {
        UsersModule.openModal(id, name, username);
    },

    delete: async (id) => {
        if (confirm('¿Estás seguro de eliminar este usuario?')) {
            await API.delete(`/usuarios/${id}`);
            UsersModule.loadUsers();
        }
    },

    save: async () => {
        const id = document.getElementById('userId').value;
        const payload = {
            nombre: document.getElementById('userName').value,
            username: document.getElementById('userUsername').value,
            password: document.getElementById('userPass').value
        };

        let res;
        if (id) {
            res = await API.put(`/usuarios/${id}`, payload);
        } else {
            res = await API.post('/usuarios', payload);
        }

        if (res && !res.error) {
            Utils.closeModal('userModal');
            UsersModule.loadUsers();
        } else {
            alert('Error al guardar: ' + (res.error || 'Desconocido'));
        }
    }
};

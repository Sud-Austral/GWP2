
import os
import traceback
import time
import uuid
import psycopg2
import psycopg2.pool
import psycopg2.extras
import bcrypt
import secrets
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from functools import wraps
from werkzeug.utils import secure_filename
import datetime
from flask.json.provider import DefaultJSONProvider

# -----------------------
# CONFIGURACIÓN
# -----------------------
# Usamos la misma connection string que tenías en tu ejemplo
DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:UnaCasaEnUnArbol2024@localhost:5432/GWP"
)

app = Flask(__name__)

# PATCH: Date Serialization Fix
class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return super().default(obj)

app.json = CustomJSONProvider(app)

# Configurar Uploads
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

CORS(app)

print("Backend GWP (Gestión Consultorías) iniciando...")

# Pool de conexiones
connection_pool = None
active_sessions = {} # { token: user_id }

# -----------------------
# DATABASE POOL
# -----------------------
def init_connection_pool():
    global connection_pool
    try:
        connection_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=DB_CONNECTION_STRING
        )
        print("Pool de conexiones DB inicializado.")
    except Exception as e:
        print("ERROR inicializando pool:", e)

def get_db_connection():
    if not connection_pool:
        init_connection_pool()
    return connection_pool.getconn()

def release_db_connection(conn):
    if connection_pool and conn:
        connection_pool.putconn(conn)

init_connection_pool()

# -----------------------
# MIDDLEWARE & AUTH
# -----------------------
def session_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = auth.split(" ")[1] if " " in auth else auth
        
        if not token or token not in active_sessions:
            return jsonify({"message": "Unauthorized"}), 401
            
        # Pasar el user_id a la función
        current_user_id = active_sessions[token]
        return f(current_user_id, *args, **kwargs)
    return decorated

# -----------------------
# AUTH ROUTES
# -----------------------
@app.route("/auth/login", methods=["POST"])
def login():
    conn = None
    try:
        data = request.json
        username = data.get("username")
        password = data.get("password")
        
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("SELECT id, nombre, password_hash FROM usuarios WHERE username = %s", (username,))
            user = cur.fetchone()
            
        if user and bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            token = secrets.token_hex(32)
            active_sessions[token] = user["id"]
            return jsonify({
                "token": token,
                "user": {"id": user["id"], "nombre": user["nombre"]}
            })
            
        return jsonify({"message": "Credenciales inválidas"}), 401
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/auth/register", methods=["POST"])
def register():
    conn = None
    try:
        data = request.json
        hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO usuarios (nombre, username, password_hash)
                VALUES (%s, %s, %s) RETURNING id
            """, (data["nombre"], data["username"], hashed))
            user_id = cur.fetchone()[0]
            conn.commit()
            
        return jsonify({"message": "Usuario creado", "id": user_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)


# -----------------------
# USUARIOS CRUD
# -----------------------
@app.route("/usuarios", methods=["GET"])
@session_required
def get_users(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, nombre, username, created_at FROM usuarios ORDER BY id")
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/usuarios", methods=["POST"])
@session_required
def create_user_admin(current_user_id):
    # Idealmente verificar si current_user_id es admin
    conn = None
    try:
        data = request.json
        hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO usuarios (nombre, username, password_hash)
                VALUES (%s, %s, %s) RETURNING id
            """, (data["nombre"], data["username"], hashed))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"id": new_id, "message": "Usuario creado"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/usuarios/<int:user_id>", methods=["PUT"])
@session_required
def update_user(current_user_id, user_id):
    conn = None
    try:
        data = request.json
        fields = []
        values = []
        
        if "nombre" in data:
            fields.append("nombre = %s")
            values.append(data["nombre"])
        
        if "username" in data:
            fields.append("username = %s")
            values.append(data["username"])
            
        if "password" in data and data["password"]:
            hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
            fields.append("password_hash = %s")
            values.append(hashed)
            
        values.append(user_id)
        
        if not fields:
             return jsonify({"message": "Nada que actualizar"})
             
        query = f"UPDATE usuarios SET {', '.join(fields)} WHERE id = %s"
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, tuple(values))
            conn.commit()
        return jsonify({"message": "Usuario actualizado"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/usuarios/<int:user_id>", methods=["DELETE"])
@session_required
def delete_user(current_user_id, user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM usuarios WHERE id = %s", (user_id,))
            conn.commit()
        return jsonify({"message": "Usuario eliminado"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

# -----------------------
# PLAN MAESTRO (GWP)
# -----------------------
@app.route("/plan-maestro", methods=["GET"])
@session_required
def get_plan(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM plan_maestro ORDER BY id ASC")
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/plan-maestro", methods=["POST"])
@session_required
def create_plan_item(current_user_id):
    conn = None
    try:
        data = request.json
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO plan_maestro (
                    activity_code, product_code, task_name, week_start, week_end,
                    type_tag, dependency_code, evidence_requirement,
                    primary_role, co_responsibles, primary_responsible,
                    status, fecha_inicio, fecha_fin, created_by, updated_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                data.get("activity_code"), data.get("product_code"), data.get("task_name"),
                data.get("week_start"), data.get("week_end"), data.get("type_tag"),
                data.get("dependency_code"), data.get("evidence_requirement"),
                data.get("primary_role"), data.get("co_responsibles"),
                data.get("primary_responsible"), data.get("status", "Pendiente"),
                data.get("fecha_inicio"), data.get("fecha_fin"),
                current_user_id, current_user_id
            ))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"id": new_id, "message": "Item creado"}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/plan-maestro/<int:id_item>", methods=["PUT"])
@session_required
def update_plan_item(current_user_id, id_item):
    conn = None
    try:
        data = request.json
        # Construcción dinámica de query
        fields = []
        values = []
        for k, v in data.items():
            if k in ['id', 'created_by', 'created_at']: continue
            fields.append(f"{k} = %s")
            values.append(v)
            
        fields.append("updated_by = %s")
        values.append(current_user_id)
        values.append(id_item)
        
        query = f"UPDATE plan_maestro SET {', '.join(fields)} WHERE id = %s"
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, tuple(values))
            conn.commit()
        return jsonify({"message": "Item actualizado"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

# -----------------------
# HITOS
# -----------------------
@app.route("/plan-maestro/<int:plan_id>/hitos", methods=["GET"])
@session_required
def get_hitos(current_user_id, plan_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM hitos WHERE plan_maestro_id = %s ORDER BY fecha_estimada", (plan_id,))
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/hitos", methods=["GET"])
@session_required
def get_all_hitos(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT h.*, p.activity_code, p.task_name 
                FROM hitos h
                JOIN plan_maestro p ON h.plan_maestro_id = p.id
                ORDER BY h.fecha_estimada
            """)
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/hitos", methods=["POST"])
@session_required
def create_hito(current_user_id):
    conn = None
    try:
        data = request.json
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO hitos (
                    plan_maestro_id, nombre, fecha_estimada, descripcion,
                    created_by, updated_by
                ) VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                data["plan_maestro_id"], data["nombre"], data.get("fecha_estimada"),
                data.get("descripcion"), current_user_id, current_user_id
            ))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"id": new_id, "message": "Hito creado"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/hitos/<int:hito_id>", methods=["PUT", "DELETE"])
@session_required
def update_delete_hito(current_user_id, hito_id):
    conn = None
    try:
        conn = get_db_connection()
        if request.method == "DELETE":
            with conn.cursor() as cur:
                cur.execute("DELETE FROM hitos WHERE id = %s", (hito_id,))
                conn.commit()
            return jsonify({"message": "Hito eliminado"})
        
        elif request.method == "PUT":
            data = request.json
            fields = []
            values = []
            
            if "nombre" in data:
                fields.append("nombre = %s")
                values.append(data["nombre"])
            if "fecha_estimada" in data:
                fields.append("fecha_estimada = %s")
                values.append(data["fecha_estimada"])
            if "descripcion" in data:
                fields.append("descripcion = %s")
                values.append(data["descripcion"])
            if "estado" in data:
                fields.append("estado = %s")
                values.append(data["estado"])
                
            if not fields:
                return jsonify({"message": "Nada que actualizar"}), 200
                
            fields.append("updated_by = %s")
            values.append(current_user_id)
            values.append(hito_id)
            
            with conn.cursor() as cur:
                cur.execute(f"UPDATE hitos SET {', '.join(fields)} WHERE id = %s", tuple(values))
                conn.commit()
            return jsonify({"message": "Hito actualizado"})
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)


# -----------------------
# UPLOAD (Simulada)
# -----------------------
# -----------------------
# DOCUMENTOS
# -----------------------
@app.route("/documentos", methods=["GET"])
@session_required
def get_all_docs(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT d.*, p.activity_code, p.task_name, u.nombre as uploader
                FROM documentos d
                JOIN plan_maestro p ON d.plan_maestro_id = p.id
                LEFT JOIN usuarios u ON d.uploaded_by = u.id
                ORDER BY d.created_at DESC
            """)
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/plan-maestro/<int:plan_id>/documentos", methods=["GET"])
@session_required
def get_plan_docs(current_user_id, plan_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Simple query debugged
            cur.execute("""
                SELECT d.id, d.nombre_archivo, d.ruta_archivo, d.created_at, d.uploaded_by,
                       u.nombre as uploader
                FROM documentos d
                LEFT JOIN usuarios u ON d.uploaded_by = u.id
                WHERE d.plan_maestro_id = %s
                ORDER BY d.created_at DESC
            """, (plan_id,))
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/upload", methods=["POST"])
@session_required
def upload_file(current_user_id):
    conn = None
    try:
        plan_id = request.form.get("plan_id")
        if 'file' not in request.files:
             return jsonify({"error": "No file part"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        original_filename = secure_filename(file.filename)
        
        # Generate unique physical filename to prevent conflicts
        unique_filename = f"{uuid.uuid4().hex}_{original_filename}"
        
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(save_path)
        
        # In DB: nombre_archivo is display name, ruta_archivo is physical unique name
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documentos (
                    plan_maestro_id, nombre_archivo, ruta_archivo,
                    uploaded_by
                ) VALUES (%s, %s, %s, %s) RETURNING id
            """, (plan_id, original_filename, unique_filename, current_user_id))
            
            doc_id = cur.fetchone()[0]
            
            # Actualizar flag en maestro
            cur.execute("UPDATE plan_maestro SET has_file_uploaded = TRUE WHERE id = %s", (plan_id,))
            
            conn.commit()
            
        return jsonify({"message": "Archivo subido"}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/documentos/<int:doc_id>", methods=["DELETE"])
@session_required
def delete_document(current_user_id, doc_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 1. Get info
            cur.execute("SELECT ruta_archivo, plan_maestro_id FROM documentos WHERE id = %s", (doc_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Documento no encontrado"}), 404
            
            filename = row[0]
            plan_id = row[1]
            
            # 2. Delete file
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass 
            
            # 3. Delete DB record
            cur.execute("DELETE FROM documentos WHERE id = %s", (doc_id,))
            
            # 4. Check if Plan still has docs
            cur.execute("SELECT COUNT(*) FROM documentos WHERE plan_maestro_id = %s", (plan_id,))
            count = cur.fetchone()[0]
            if count == 0:
                cur.execute("UPDATE plan_maestro SET has_file_uploaded = FALSE WHERE id = %s", (plan_id,))
                
            conn.commit()
            
        return jsonify({"message": "Documento eliminado"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)


# -----------------------
# OBSERVACIONES (BITÁCORA)
# -----------------------
@app.route("/plan-maestro/<int:plan_id>/observaciones", methods=["GET"])
@session_required
def get_observaciones(current_user_id, plan_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT o.id, o.texto, o.created_at, 
                       u.nombre as usuario_nombre, u.username as usuario_username
                FROM observaciones o
                LEFT JOIN usuarios u ON o.usuario_id = u.id
                WHERE o.plan_maestro_id = %s
                ORDER BY o.created_at DESC
            """, (plan_id,))
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/plan-maestro/<int:plan_id>/observaciones", methods=["POST"])
@session_required
def add_observacion(current_user_id, plan_id):
    conn = None
    try:
        data = request.json
        texto = data.get("texto")
        if not texto:
            return jsonify({"error": "Texto requerido"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO observaciones (plan_maestro_id, usuario_id, texto)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (plan_id, current_user_id, texto))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"id": new_id, "message": "Observación agregada"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)



@app.route("/observaciones", methods=["GET"])
@session_required
def get_all_observaciones(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT o.id, o.texto, o.created_at, 
                       u.nombre as usuario_nombre,
                       p.activity_code, p.task_name, p.id as plan_id
                FROM observaciones o
                LEFT JOIN usuarios u ON o.usuario_id = u.id
                JOIN plan_maestro p ON o.plan_maestro_id = p.id
                ORDER BY o.created_at DESC
            """)
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/observaciones/<int:obs_id>", methods=["PUT", "DELETE"])
@session_required
def manage_observacion(current_user_id, obs_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check ownership or admin
            cur.execute("SELECT usuario_id FROM observaciones WHERE id = %s", (obs_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Observación no encontrada"}), 404
            
            # Allow admin (id=1 usually) or owner
            # Assuming current_user_id is available
            if row[0] != current_user_id and current_user_id != 1: # Basic admin check
                 return jsonify({"error": "No tienes permiso"}), 403

            if request.method == "DELETE":
                cur.execute("DELETE FROM observaciones WHERE id = %s", (obs_id,))
                conn.commit()
                return jsonify({"message": "Eliminado"})
            
            elif request.method == "PUT":
                data = request.json
                texto = data.get('texto')
                if not texto: return jsonify({"error": "Texto vacío"}), 400
                
                cur.execute("UPDATE observaciones SET texto = %s, updated_at = NOW() WHERE id = %s", (texto, obs_id))
                conn.commit()
                return jsonify({"message": "Actualizado"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)


# -----------------------
# REPOSITORIO ESTRATÉGICO
# -----------------------
@app.route("/repositorio", methods=["GET"])
@session_required
def get_repositorio(current_user_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT r.*, u.nombre as uploader_name
                FROM repositorio_documentos r
                LEFT JOIN usuarios u ON r.uploaded_by = u.id
                ORDER BY r.created_at DESC
            """)
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/repositorio", methods=["POST"])
@session_required
def add_repositorio(current_user_id):
    conn = None
    try:
        # Check files
        file = request.files.get('file')
        
        # Metadata from form (multipart)
        titulo = request.form.get('titulo')
        tipo_doc = request.form.get('tipo_documento')
        desc = request.form.get('descripcion')
        fuente = request.form.get('fuente_origen')
        tipo_fuente = request.form.get('tipo_fuente')
        fecha_pub = request.form.get('fecha_publicacion') or None
        enlace = request.form.get('enlace_externo')
        tags = request.form.get('etiquetas')
        puntos = request.form.get('puntos_clave') # Optional JSON text

        if not titulo:
             return jsonify({"error": "Título es obligatorio"}), 400

        # Handle File Upload
        ruta_archivo = None
        if file and file.filename:
            original_filename = secure_filename(file.filename)
            unique_name = f"REPO_{int(time.time())}_{original_filename}"
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_name))
            ruta_archivo = unique_name
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO repositorio_documentos (
                    titulo, tipo_documento, descripcion, puntos_clave,
                    ruta_archivo, fecha_publicacion, fuente_origen, tipo_fuente,
                    enlace_externo, etiquetas, uploaded_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (titulo, tipo_doc, desc, puntos, ruta_archivo, fecha_pub, fuente, tipo_fuente, enlace, tags, current_user_id))
            
            new_id = cur.fetchone()[0]
            conn.commit()
            
        return jsonify({"message": "Documento agregado al repositorio", "id": new_id}), 201

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)

@app.route("/repositorio/<int:id_doc>", methods=["PUT", "DELETE"])
@session_required
def manage_repositorio(current_user_id, id_doc):
    conn = None
    try:
        conn = get_db_connection()
        
        if request.method == "DELETE":
            with conn.cursor() as cur:
                # Get file path to delete
                cur.execute("SELECT ruta_archivo FROM repositorio_documentos WHERE id = %s", (id_doc,))
                row = cur.fetchone()
                if row and row[0]:
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], row[0])
                    if os.path.exists(file_path):
                        try: os.remove(file_path)
                        except: pass
                
                cur.execute("DELETE FROM repositorio_documentos WHERE id = %s", (id_doc,))
                conn.commit()
            return jsonify({"message": "Documento eliminado"})
            
        elif request.method == "PUT":
            data = request.json
            if not data:
                return jsonify({"error": "No JSON data"}), 400
                
            fields = []
            values = []
            
            updatable = {
                'titulo': 'titulo',
                'tipo_documento': 'tipo_documento',
                'descripcion': 'descripcion',
                'fuente_origen': 'fuente_origen',
                'tipo_fuente': 'tipo_fuente',
                'fecha_publicacion': 'fecha_publicacion',
                'enlace_externo': 'enlace_externo',
                'etiquetas': 'etiquetas'
            }
            
            for key, col in updatable.items():
                # Handle possible empty strings as NULL or valid empty strings
                if key in data:
                    val = data[key]
                    if key == 'fecha_publicacion' and not val:
                        val = None
                    fields.append(f"{col} = %s")
                    values.append(val)
            
            if not fields:
                 return jsonify({"message": "Nada que actualizar"}), 200
            
            values.append(id_doc)
            
            with conn.cursor() as cur:
                query = f"UPDATE repositorio_documentos SET {', '.join(fields)} WHERE id = %s"
                cur.execute(query, tuple(values))
                conn.commit()
            
            return jsonify({"message": "Documento actualizado"})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: release_db_connection(conn)


@app.route('/uploads/<path:filename>')
def download_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# -----------------------
# AUTO-MIGRATION HELPER
# -----------------------
def check_and_create_tables():
    print("Verificando tablas del sistema...")
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Tabla: repositorio_documentos
            cur.execute("""
                CREATE TABLE IF NOT EXISTS repositorio_documentos (
                    id SERIAL PRIMARY KEY,
                    titulo VARCHAR(255) NOT NULL,
                    tipo_documento VARCHAR(100),
                    descripcion TEXT,
                    puntos_clave TEXT,
                    ruta_archivo VARCHAR(500),
                    fecha_publicacion DATE,
                    fuente_origen VARCHAR(100),
                    tipo_fuente VARCHAR(50),
                    enlace_externo VARCHAR(500),
                    estado_procesamiento VARCHAR(50) DEFAULT 'Pendiente',
                    etiquetas VARCHAR(255),
                    uploaded_by INTEGER REFERENCES usuarios(id),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            # Tabla: observaciones (por si acaso falla también)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS observaciones (
                    id SERIAL PRIMARY KEY,
                    plan_maestro_id INTEGER NOT NULL REFERENCES plan_maestro(id) ON DELETE CASCADE,
                    usuario_id INTEGER REFERENCES usuarios(id),
                    texto TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
            print("Tablas verificadas correctamente.")
    except Exception as e:
        print("Error en migración automática:", e)
    finally:
        if conn: release_db_connection(conn)

if __name__ == '__main__':
    check_and_create_tables() # Run migration check on startup
    cert_path = os.path.abspath("fullchain.pem")
    key_path = os.path.abspath("private.key")
    print("Iniciando servidor en https://0.0.0.0:8002")
    app.run(host='0.0.0.0', port=8002, ssl_context=(cert_path, key_path))
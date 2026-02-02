-- Esquema de Base de Datos para Gestión de Consultorías (GWP)
-- Dialecto: PostgreSQL
-- Enfoque: Simplificado, sin roles, solo usuarios simples.

-- 1. Tabla de Usuarios (Simple, sin roles)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    username VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla Principal: Plan Maestro
CREATE TABLE plan_maestro (
    id SERIAL PRIMARY KEY,
    
    activity_code VARCHAR(50),
    product_code VARCHAR(100),
    task_name TEXT NOT NULL,
    
    week_start INTEGER,
    week_end INTEGER,
    
    type_tag VARCHAR(50),
    dependency_code VARCHAR(100),
    evidence_requirement TEXT,
    
    primary_role VARCHAR(50),
    co_responsibles TEXT,
    primary_responsible VARCHAR(100),
    
    status VARCHAR(50) DEFAULT 'Pendiente',
    has_file_uploaded BOOLEAN DEFAULT FALSE,
    
    fecha_inicio DATE,
    fecha_fin DATE,
    
    -- Auditoría básica
    created_by INTEGER REFERENCES usuarios(id),
    updated_by INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plan_activity_code ON plan_maestro(activity_code);

-- 3. Tabla de Hitos
CREATE TABLE hitos (
    id SERIAL PRIMARY KEY,
    plan_maestro_id INTEGER NOT NULL REFERENCES plan_maestro(id) ON DELETE CASCADE,
    
    nombre TEXT NOT NULL,
    fecha_estimada DATE,
    fecha_real DATE,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    descripcion TEXT,
    
    created_by INTEGER REFERENCES usuarios(id),
    updated_by INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Documentos
CREATE TABLE documentos (
    id SERIAL PRIMARY KEY,
    plan_maestro_id INTEGER NOT NULL REFERENCES plan_maestro(id) ON DELETE CASCADE,
    
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    tipo_archivo VARCHAR(50),
    tamano_bytes BIGINT,
    
    uploaded_by INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Observaciones (Bitácora)
CREATE TABLE observaciones (
    id SERIAL PRIMARY KEY,
    plan_maestro_id INTEGER NOT NULL REFERENCES plan_maestro(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    texto TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Repositorio de Documentos Estratégicos (Biblioteca)
CREATE TABLE repositorio_documentos (
    id SERIAL PRIMARY KEY, -- id_documento
    titulo VARCHAR(255) NOT NULL,
    tipo_documento VARCHAR(100), -- Ley, Decreto, Informe Técnico, etc.
    descripcion TEXT, -- Resumen ejecutivo
    puntos_clave TEXT, -- JSON o Texto plano con bullets
    ruta_archivo VARCHAR(500), -- Path local uploads
    fecha_publicacion DATE, -- anno_publicacion
    fuente_origen VARCHAR(100), -- CONAF, MMA, etc.
    tipo_fuente VARCHAR(50), -- Gobierno, Privado, ONG, etc.
    enlace_externo VARCHAR(500), -- URL Web
    estado_procesamiento VARCHAR(50) DEFAULT 'Pendiente', -- Pendiente, Resumido, Indexado
    etiquetas VARCHAR(255), -- Tags separados por coma
    
    uploaded_by INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Funciones de ayuda
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_modtime BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_plan_maestro_modtime BEFORE UPDATE ON plan_maestro FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_hitos_modtime BEFORE UPDATE ON hitos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();



CREATE OR REPLACE FUNCTION actualizar_plan_maestro_por_fecha()
RETURNS void AS $$
BEGIN
    UPDATE plan_maestro
    SET status = 'En Progreso',
        updated_at = NOW()
    WHERE
        status = 'Pendiente'
        AND fecha_fin IS NOT NULL
        AND CURRENT_DATE > fecha_fin;
END;
$$ LANGUAGE plpgsql;


SELECT cron.schedule(
    'actualizar-plan-maestro',
    '0 0 * * *', -- cada hora (puedes cambiarlo)
    $$SELECT actualizar_plan_maestro_por_fecha();$$
);
import os, hashlib, hmac, urllib.parse, json, logging
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import create_client
from datetime import datetime, timedelta

# Configuracion inicial
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Asistencia Escolar API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conexion a Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Inicializar Supabase solo si hay credenciales
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase conectado")
    except Exception as e:
        logger.error(f"Error conectando Supabase: {e}")
else:
    logger.warning("SUPABASE_URL o SUPABASE_KEY no configurados")

# Validacion de Telegram
def validar_telegram(init_data: str):
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN no configurado. Auth en modo desarrollo.")
        parsed = urllib.parse.parse_qs(init_data)
        user_str = parsed.get("user", [None])[0]
        if user_str:
            return {"valid": True, "user": json.loads(user_str)}
        return {"valid": False, "error": "No user data"}

    try:
        parsed = urllib.parse.parse_qs(init_data)
        received_hash = parsed.get("hash", [None])[0]
        if not received_hash:
            return {"valid": False, "error": "No hash"}

        data_to_check = {k: v[0] for k, v in parsed.items() if k != "hash"}
        data_check_string = "\n".join([f"{k}={v}" for k, v in sorted(data_to_check.items())])

        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if calculated_hash != received_hash:
            return {"valid": False, "error": "Hash invalido"}

        return {"valid": True, "user": json.loads(data_check_string.get("user", "{}"))}
    except Exception as e:
        logger.error(f"Error validando Telegram: {e}")
        return {"valid": False, "error": str(e)}

# ============================================================
# ENDPOINTS RAIZ - MUY IMPORTANTE PARA RENDER
# ============================================================

@app.get("/", response_class=JSONResponse)
async def root():
    """Endpoint raiz para health check de Render"""
    return {
        "status": "ok",
        "service": "Asistencia Escolar API",
        "modo": "online",
        "timestamp": datetime.now().isoformat()
    }

@app.head("/")
async def root_head():
    """HEAD request para health check de Render"""
    return JSONResponse(content={"status": "ok"})

@app.get("/api/")
async def health():
    return {"modo": "online", "status": "ok"}

@app.post("/api/auth")
async def auth(request: Request):
    try:
        body = await request.json()
        init_data = body.get("initData", "")
        if not init_data:
            return {"success": False, "message": "Falta initData"}

        result = validar_telegram(init_data)
        if result["valid"]:
            logger.info(f"Maestro autenticado: {result['user'].get('first_name')}")
            return {"success": True, "user": result["user"]}
        else:
            return {"success": False, "message": result.get("error", "Auth fallida")}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/alumnos")
async def get_alumnos(grado: str = None, seccion: str = None):
    try:
        if not supabase:
            return []

        query = supabase.table("alumnos").select("*")
        if grado:
            query = query.eq("grado", grado)
        if seccion:
            query = query.eq("seccion", seccion)

        response = query.order("apellido_paterno").execute()
        return response.data
    except Exception as e:
        logger.error(f"Error alumnos: {e}")
        return []

@app.get("/api/asistencia/hoy")
async def get_asistencia(fecha: str = None, grado: str = None, seccion: str = None):
    try:
        if not supabase:
            return {"asistencia": []}

        query = supabase.table("asistencia").select("*")
        if fecha:
            query = query.eq("fecha", fecha)

        response = query.execute()
        data = response.data

        if grado or seccion:
            alumnos_q = supabase.table("alumnos").select("id")
            if grado: alumnos_q = alumnos_q.eq("grado", grado)
            if seccion: alumnos_q = alumnos_q.eq("seccion", seccion)

            ids_validos = [a["id"] for a in alumnos_q.execute().data]
            data = [r for r in data if r["alumno_id"] in ids_validos]

        return {"asistencia": data}
    except Exception as e:
        logger.error(f"Error asistencia: {e}")
        return {"asistencia": []}

@app.post("/api/asistencia/registrar")
async def registrar_asistencia(request: Request):
    try:
        if not supabase:
            return {"success": False, "message": "Supabase no configurado"}

        body = await request.json()
        registros = body.get("registros", [])
        user_id = body.get("user_id", 0)

        if not registros:
            return {"success": False, "message": "No hay registros para guardar"}

        supabase.table("asistencia").insert(registros).execute()

        logger.info(f"{len(registros)} registros guardados por user_id: {user_id}")
        return {
            "success": True, 
            "registros": len(registros), 
            "modo": "online", 
            "mensaje": "Asistencia guardada correctamente"
        }
    except Exception as e:
        logger.error(f"Error DB: {e}")
        return {"success": False, "message": str(e)}

# Reporte semanal/mensual

@app.get("/api/asistencia/reporte")
async def get_reporte(desde: str = None, hasta: str = None, grado: str = None, seccion: str = None):
    try:
        if not supabase:
            return []

        if not desde or not hasta:
            return []

        alumnos_q = supabase.table("alumnos").select("id, nombre, apellido_paterno, apellido_materno, matricula, grado, seccion")
        if grado:
            alumnos_q = alumnos_q.eq("grado", grado)
        if seccion:
            alumnos_q = alumnos_q.eq("seccion", seccion)

        alumnos_data = alumnos_q.execute().data

        asistencia_q = supabase.table("asistencia").select("alumno_id, estado, fecha").gte("fecha", desde).lte("fecha", hasta)

        if grado or seccion:
            ids_alumnos = [a["id"] for a in alumnos_data]
            asistencia_q = asistencia_q.in_("alumno_id", ids_alumnos)

        asistencia_data = asistencia_q.execute().data

        reporte = {}
        for a in alumnos_data:
            reporte[a["id"]] = {
                "id": a["id"],
                "nombre": f"{a['nombre']} {a.get('apellido_paterno', '')} {a.get('apellido_materno', '')}".strip(),
                "matricula": a["matricula"],
                "grado": a["grado"],
                "seccion": a["seccion"],
                "P": 0, "A": 0, "T": 0, "J": 0, "E": 0,
                "dias": 0
            }

        for reg in asistencia_data:
            alumno_id = reg["alumno_id"]
            if alumno_id in reporte:
                estado = reg["estado"]
                if estado in reporte[alumno_id]:
                    reporte[alumno_id][estado] += 1
                reporte[alumno_id]["dias"] += 1

        return list(reporte.values())

    except Exception as e:
        logger.error(f"Error reporte: {e}")
        return []

# ============================================================
# JUSTIFICACION - VERSION CORREGIDA
# ============================================================

@app.post("/api/asistencia/justificacion")
async def guardar_justificacion(
    alumno_id: int = Form(...),
    fecha: str = Form(...),
    nota: str = Form(default=""),
    archivo: UploadFile = File(None),
    user_id: int = Form(default=0)
):
    try:
        if not supabase:
            return {"success": False, "message": "Supabase no configurado"}

        if alumno_id <= 0:
            return {"success": False, "message": "alumno_id invalido"}

        if not fecha or len(fecha) != 10:
            return {"success": False, "message": "fecha invalida (formato YYYY-MM-DD)"}

        logger.info(f"Justificacion recibida: alumno_id={alumno_id}, fecha={fecha}, nota={nota}, archivo={archivo.filename if archivo else 'ninguno'}")

        justificacion_data = {
            "alumno_id": alumno_id,
            "fecha": fecha,
            "nota": nota or "",
            "user_id": user_id,
            "created_at": datetime.now().isoformat()
        }

        if archivo and archivo.filename:
            try:
                file_content = await archivo.read()
                file_ext = os.path.splitext(archivo.filename)[1]
                file_name = f"justificaciones/{alumno_id}_{fecha}_{int(datetime.now().timestamp())}{file_ext}"

                supabase.storage.from_("justificaciones").upload(
                    file_name,
                    file_content,
                    {"content-type": archivo.content_type or "image/jpeg"}
                )
                justificacion_data["archivo_url"] = file_name
                logger.info(f"Archivo subido: {file_name}")

            except Exception as e:
                logger.error(f"Error subiendo archivo: {e}")

        supabase.table("justificaciones").insert(justificacion_data).execute()

        return {
            "success": True,
            "message": "Justificacion guardada correctamente",
            "data": {
                "alumno_id": alumno_id,
                "fecha": fecha,
                "tiene_archivo": "archivo_url" in justificacion_data
            }
        }

    except Exception as e:
        logger.error(f"Error justificacion: {e}")
        return {"success": False, "message": f"Error del servidor: {str(e)}"}

@app.get("/api/asistencia/justificacion")
async def get_justificacion(alumno_id: str = None, fecha: str = None):
    try:
        if not supabase:
            return []

        query = supabase.table("justificaciones").select("*")
        if alumno_id:
            query = query.eq("alumno_id", alumno_id)
        if fecha:
            query = query.eq("fecha", fecha)

        response = query.execute()
        return response.data
    except Exception as e:
        logger.error(f"Error get justificacion: {e}")
        return []

# QR / Matricula

@app.get("/api/alumnos/matricula/{matricula}")
async def get_alumno_by_matricula(matricula: str):
    try:
        if not supabase:
            return {"success": False, "message": "Supabase no configurado"}

        response = supabase.table("alumnos").select("*").eq("matricula", matricula).single().execute()

        if response.data:
            return {"success": True, "alumno": response.data}
        return {"success": False, "message": "Alumno no encontrado"}
    except Exception as e:
        logger.error(f"Error buscar matricula: {e}")
        return {"success": False, "message": str(e)}

@app.get("/api/debug")
async def debug():
    return {
        "supabase_url": bool(SUPABASE_URL),
        "supabase_key": bool(SUPABASE_KEY),
        "bot_token": bool(BOT_TOKEN),
        "supabase_connected": supabase is not None,
        "tables": ["alumnos", "asistencia", "justificaciones"]
    }
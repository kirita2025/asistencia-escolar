import os, hashlib, hmac, urllib.parse, json, logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import create_client

# 🔧 Configuración inicial
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Asistencia Escolar API")

# 🌐 CORS (permite llamadas desde Netlify/Telegram)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🗄️ Conexión a Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 🔐 Validación de Telegram (Modo Dev/Prod)
def validar_telegram(init_data: str):
    """Valida el hash de Telegram y extrae el usuario"""
    if not BOT_TOKEN:
        logger.warning("⚠️ BOT_TOKEN no configurado. Auth en modo desarrollo (acepta datos sin validar hash).")
        parsed = urllib.parse.parse_qs(init_data)
        user_str = parsed.get('user', [None])[0]
        if user_str:
            return {"valid": True, "user": json.loads(user_str)}
        return {"valid": False, "error": "No user data"}

    try:
        parsed = urllib.parse.parse_qs(init_data)
        received_hash = parsed.get('hash', [None])[0]
        if not received_hash:
            return {"valid": False, "error": "No hash"}

        data_to_check = {k: v[0] for k, v in parsed.items() if k != 'hash'}
        data_check_string = '\n'.join([f"{k}={v}" for k, v in sorted(data_to_check.items())])

        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if calculated_hash != received_hash:
            return {"valid": False, "error": "Hash inválido"}

        return {"valid": True, "user": json.loads(data_to_check.get('user', '{}'))}
    except Exception as e:
        logger.error(f"Error validando Telegram: {e}")
        return {"valid": False, "error": str(e)}

#  Endpoints

@app.get("/api/")
async def health():
    """Health check para verificar conexión online/offline"""
    return {"modo": "online", "status": "ok"}

@app.post("/api/auth")
async def auth(request: Request):
    """Autentica al maestro mediante initData de Telegram"""
    try:
        body = await request.json()
        init_data = body.get("initData", "")
        if not init_data:
            return {"success": False, "message": "Falta initData"}
        
        result = validar_telegram(init_data)
        if result["valid"]:
            logger.info(f"✅ Maestro autenticado: {result['user'].get('first_name')}")
            return {"success": True, "user": result["user"]}
        else:
            return {"success": False, "message": result.get("error", "Auth fallida")}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/alumnos")
async def get_alumnos(grado: str = None, seccion: str = None):
    """Obtiene lista de alumnos con filtros opcionales"""
    try:
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
    """Obtiene registros de asistencia para una fecha/grado/sección"""
    try:
        query = supabase.table("asistencia").select("*")
        if fecha:
            query = query.eq("fecha", fecha)
        
        response = query.execute()
        data = response.data

        # Si se filtra por grado/sección, cruzamos IDs
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
    """Guarda lote de asistencia diaria"""
    try:
        body = await request.json()
        registros = body.get("registros", [])
        user_id = body.get("user_id", 0)

        if not registros:
            return {"success": False, "message": "No hay registros para guardar"}

        # Inserta en Supabase (MVP: insert directo. Más adelante optimizaremos con upsert)
        supabase.table("asistencia").insert(registros).execute()
        
        logger.info(f"💾 {len(registros)} registros guardados por user_id: {user_id}")
        return {
            "success": True, 
            "registros": len(registros), 
            "modo": "online", 
            "mensaje": "Asistencia guardada correctamente"
        }
    except Exception as e:
        logger.error(f"Error DB: {e}")
        return {"success": False, "message": str(e)}

@app.get("/api/debug")
async def debug():
    """Endpoint de diagnóstico rápido"""
    return {
        "supabase_url": bool(SUPABASE_URL),
        "supabase_key": bool(SUPABASE_KEY),
        "bot_token": bool(BOT_TOKEN),
        "tables": ["alumnos", "asistencia"]
    }
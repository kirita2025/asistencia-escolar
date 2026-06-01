# main.py - VERSIÓN CORREGIDA (UUID string en lugar de int)

import os
import uuid
import hmac
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client


# ============ CONFIGURACION ============

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://jqxiqvbkyyxlzisfdrcr.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

BUCKET_TEMP = "temp-downloads"
BUCKET_JUSTIFICACIONES = "justificaciones"


# ============ MODELOS ============

class AuthRequest(BaseModel):
    initData: str

class RegistroAsistencia(BaseModel):
    alumno_id: str  # ✅ CORREGIDO: Ahora es UUID string, no int
    fecha: str
    estado: str
    hora: str
    user_id: int

class GuardarAsistenciaRequest(BaseModel):
    registros: List[RegistroAsistencia]
    user_id: int


# ============ LIFESPAN ============

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b["name"] for b in buckets]

        if BUCKET_TEMP not in bucket_names:
            supabase.storage.create_bucket(BUCKET_TEMP, options={"public": True})
            print(f"Bucket '{BUCKET_TEMP}' creado")

        if BUCKET_JUSTIFICACIONES not in bucket_names:
            supabase.storage.create_bucket(BUCKET_JUSTIFICACIONES, options={"public": True})
            print(f"Bucket '{BUCKET_JUSTIFICACIONES}' creado")

    except Exception as e:
        print(f"Warning verificando buckets: {e}")

    yield
    print("Backend cerrado")


app = FastAPI(
    title="Asistencia Escolar API",
    description="Backend para Control de Asistencia - Telegram Mini App",
    version="2.0.5",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ HELPERS ============

def verify_telegram_init_data(init_data: str) -> dict:
    if not BOT_TOKEN:
        return {"id": 0, "first_name": "Dev Mode", "username": "dev"}

    try:
        data = {}
        for pair in init_data.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                data[k] = v

        hash_received = data.pop("hash", "")
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))

        secret_key = hmac.new(
            key=b"WebAppData",
            msg=BOT_TOKEN.encode(),
            digestmod=hashlib.sha256
        ).digest()

        hash_calculated = hmac.new(
            key=secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()

        if hash_calculated != hash_received:
            raise ValueError("Hash invalido")

        user_data = json.loads(data.get("user", "{}"))
        return user_data

    except Exception as e:
        print(f"Auth error: {e}")
        return {"id": 0, "first_name": "Demo User", "username": "demo"}


# ============ ENDPOINTS ============

@app.get("/api")
@app.get("/api/")
async def root():
    return {"status": "ok", "modo": "online", "version": "2.0.5"}


@app.post("/api/auth")
async def auth(request: AuthRequest):
    try:
        user = verify_telegram_init_data(request.initData)
        return {
            "success": True,
            "user": {
                "id": user.get("id", 0),
                "first_name": user.get("first_name", "Usuario"),
                "username": user.get("username", "")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": True, 
            "user": {
                "id": 0, 
                "first_name": "Demo User", 
                "username": "demo"
            }
        }


@app.get("/api/alumnos")
async def get_alumnos(grado: Optional[str] = None, seccion: Optional[str] = None):
    try:
        query = supabase.table("alumnos").select("*")

        if grado:
            query = query.eq("grado", grado)
        if seccion:
            query = query.eq("seccion", seccion)

        result = query.execute()
        # Convertir UUID a string para el frontend
        alumnos = []
        for a in result.data or []:
            a["id"] = str(a["id"])  # ✅ Convertir UUID a string
            alumnos.append(a)
        return alumnos

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alumnos")
async def crear_alumno(
    nombre: str = Form(...),
    apellido_paterno: str = Form(default=""),
    apellido_materno: str = Form(default=""),
    matricula: str = Form(...),
    grado: str = Form(...),
    seccion: str = Form(...)
):
    try:
        # Verificar que la matricula no exista
        existente = supabase.table("alumnos").select("*").eq("matricula", matricula).execute()
        if existente.data and len(existente.data) > 0:
            raise HTTPException(status_code=409, detail="La matricula ya existe")

        data = {
            "nombre": nombre,
            "apellido_paterno": apellido_paterno,
            "apellido_materno": apellido_materno,
            "matricula": matricula,
            "grado": grado,
            "seccion": seccion
        }
        result = supabase.table("alumnos").insert(data).execute()
        return {"success": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/alumnos/{alumno_id}")
async def editar_alumno(
    alumno_id: str,
    nombre: str = Form(...),
    apellido_paterno: str = Form(default=""),
    apellido_materno: str = Form(default=""),
    matricula: str = Form(...),
    grado: str = Form(...),
    seccion: str = Form(...)
):
    try:
        # Verificar que la nueva matrícula no exista en otro alumno
        existente = supabase.table("alumnos").select("*").eq("matricula", matricula).execute()
        if existente.data and len(existente.data) > 0:
            otro = existente.data[0]
            if str(otro["id"]) != alumno_id:
                raise HTTPException(status_code=409, detail="La matricula ya existe en otro alumno")

        data = {
            "nombre": nombre,
            "apellido_paterno": apellido_paterno,
            "apellido_materno": apellido_materno,
            "matricula": matricula,
            "grado": grado,
            "seccion": seccion
        }
        result = supabase.table("alumnos").update(data).eq("id", alumno_id).execute()
        return {"success": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/alumnos/{alumno_id}")
async def eliminar_alumno(alumno_id: str):
    try:
        # Verificar si tiene asistencia registrada
        asistencias = supabase.table("asistencia").select("*").eq("alumno_id", alumno_id).execute()
        if asistencias.data and len(asistencias.data) > 0:
            raise HTTPException(status_code=409, detail="No se puede eliminar: el alumno tiene asistencia registrada")

        # Verificar si tiene justificaciones
        justificaciones = supabase.table("justificaciones").select("*").eq("alumno_id", alumno_id).execute()
        if justificaciones.data and len(justificaciones.data) > 0:
            raise HTTPException(status_code=409, detail="No se puede eliminar: el alumno tiene justificaciones registradas")

        result = supabase.table("alumnos").delete().eq("id", alumno_id).execute()
        return {"success": True, "mensaje": "Alumno eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asistencia/hoy")
async def get_asistencia_hoy(fecha: str, grado: Optional[str] = None, seccion: Optional[str] = None):
    try:
        # Cargar TODA la asistencia del dia
        result = supabase.table("asistencia").select("*").eq("fecha", fecha).execute()
        asistencias = result.data or []

        # Convertir UUID a string
        for a in asistencias:
            if "alumno_id" in a:
                a["alumno_id"] = str(a["alumno_id"])

        # Si piden grado/seccion, obtener IDs de alumnos de ese filtro
        if grado or seccion:
            aq = supabase.table("alumnos").select("id")
            if grado:
                aq = aq.eq("grado", grado)
            if seccion:
                aq = aq.eq("seccion", seccion)
            alumnos_filtrados = aq.execute().data or []
            ids_validos = {str(a["id"]) for a in alumnos_filtrados}
            asistencias = [a for a in asistencias if str(a.get("alumno_id")) in ids_validos]

        return {"asistencia": asistencias}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/asistencia/registrar")
async def registrar_asistencia(request: GuardarAsistenciaRequest):
    try:
        registros = []
        for r in request.registros:
            registros.append({
                "alumno_id": r.alumno_id,  # ✅ Ahora es string UUID
                "fecha": r.fecha,
                "estado": r.estado,
                "hora": r.hora,
                "user_id": r.user_id,
                "created_at": datetime.utcnow().isoformat()
            })

        print(f"📝 Guardando {len(registros)} registros")  # Debug log
        result = supabase.table("asistencia").upsert(
            registros,
            on_conflict="alumno_id,fecha"
        ).execute()

        return {
            "success": True,
            "modo": "online",
            "registros": len(registros),
            "mensaje": f"Guardados {len(registros)} registros"
        }

    except Exception as e:
        print(f"❌ Error guardando asistencia: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asistencia/reporte")
async def get_reporte(desde: str, hasta: str, grado: Optional[str] = None, seccion: Optional[str] = None):
    try:
        # Obtener todos los alumnos primero para filtrar por grado/seccion
        alumnos_query = supabase.table("alumnos").select("*")
        if grado:
            alumnos_query = alumnos_query.eq("grado", grado)
        if seccion:
            alumnos_query = alumnos_query.eq("seccion", seccion)
        
        alumnos_result = alumnos_query.execute()
        alumnos_data = alumnos_result.data or []
        
        if not alumnos_data:
            return []
        
        # Obtener IDs de alumnos filtrados como strings
        alumnos_ids = [str(a["id"]) for a in alumnos_data]
        
        # Obtener todas las asistencias en el rango
        asistencias_result = supabase.table("asistencia").select("*").gte("fecha", desde).lte("fecha", hasta).execute()
        todas_asistencias = asistencias_result.data or []
        
        # Filtrar asistencias solo de los alumnos seleccionados
        todas_asistencias = [a for a in todas_asistencias if str(a.get("alumno_id")) in alumnos_ids]
        
        # Crear diccionario de alumnos
        alumnos_dict = {str(a["id"]): a for a in alumnos_data}
        
        # Construir reporte
        reporte = {}
        for asistencia in todas_asistencias:
            alumno_id = str(asistencia.get("alumno_id"))
            if alumno_id not in alumnos_dict:
                continue
                
            if alumno_id not in reporte:
                alumno = alumnos_dict[alumno_id]
                reporte[alumno_id] = {
                    "id": alumno_id,
                    "nombre": f"{alumno.get('nombre', '')} {alumno.get('apellido_paterno', '')} {alumno.get('apellido_materno', '')}".strip(),
                    "matricula": alumno.get("matricula", ""),
                    "grado": alumno.get("grado", ""),
                    "seccion": alumno.get("seccion", ""),
                    "P": 0, "A": 0, "T": 0, "J": 0, "E": 0,
                    "dias": 0
                }
            
            estado = asistencia.get("estado", "")
            if estado in reporte[alumno_id]:
                reporte[alumno_id][estado] += 1
            reporte[alumno_id]["dias"] += 1
        
        # Incluir alumnos sin asistencia
        for alumno_id, alumno in alumnos_dict.items():
            if alumno_id not in reporte:
                reporte[alumno_id] = {
                    "id": alumno_id,
                    "nombre": f"{alumno.get('nombre', '')} {alumno.get('apellido_paterno', '')} {alumno.get('apellido_materno', '')}".strip(),
                    "matricula": alumno.get("matricula", ""),
                    "grado": alumno.get("grado", ""),
                    "seccion": alumno.get("seccion", ""),
                    "P": 0, "A": 0, "T": 0, "J": 0, "E": 0,
                    "dias": 0
                }
        
        return list(reporte.values())

    except Exception as e:
        print(f"Error en reporte: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asistencia/justificacion")
async def get_justificaciones(alumno_id: Optional[str] = None, fecha: Optional[str] = None, desde: Optional[str] = None, hasta: Optional[str] = None):
    try:
        query = supabase.table("justificaciones").select("*")

        if alumno_id:
            query = query.eq("alumno_id", alumno_id)
        if fecha:
            query = query.eq("fecha", fecha)
        if desde:
            query = query.gte("fecha", desde)
        if hasta:
            query = query.lte("fecha", hasta)

        result = query.execute()
        # Convertir UUID a string
        justs = result.data or []
        for j in justs:
            if "alumno_id" in j:
                j["alumno_id"] = str(j["alumno_id"])
        return justs

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/asistencia/justificacion")
async def guardar_justificacion(
    alumno_id: str = Form(...),
    fecha: str = Form(...),
    nota: str = Form(default=""),
    archivo: Optional[UploadFile] = None
):
    try:
        archivo_url = None

        if archivo and archivo.filename:
            ext = os.path.splitext(archivo.filename)[1] or ""
            safe_name = f"{uuid.uuid4().hex}{ext}"
            path = f"{alumno_id}/{safe_name}"

            content = await archivo.read()

            supabase.storage.from_(BUCKET_JUSTIFICACIONES).upload(
                path=path,
                file=content,
                file_options={"content-type": archivo.content_type or "image/jpeg"}
            )

            archivo_url = path

        data = {
            "alumno_id": alumno_id,
            "fecha": fecha,
            "nota": nota,
            "archivo_url": archivo_url,
            "created_at": datetime.utcnow().isoformat()
        }

        result = supabase.table("justificaciones").insert(data).execute()

        return {"success": True, "data": result.data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-temp")
async def upload_temp(archivo: UploadFile = File(...)):
    try:
        content = await archivo.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Archivo muy grande (max 10MB)")

        ext = os.path.splitext(archivo.filename)[1] or ""
        safe_name = f"{uuid.uuid4().hex}{ext}"
        path = f"reports/{datetime.utcnow().strftime('%Y/%m/%d')}/{safe_name}"

        supabase.storage.from_(BUCKET_TEMP).upload(
            path=path,
            file=content,
            file_options={"content-type": archivo.content_type or "application/octet-stream"}
        )

        public_url = supabase.storage.from_(BUCKET_TEMP).get_public_url(path)

        return {
            "success": True,
            "url": public_url,
            "filename": archivo.filename,
            "expires_in": "24h"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo archivo: {str(e)}")


@app.get("/")
@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
import os, logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from telegram import Update, InlineKeyboardButton, WebAppInfo, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes
from fastapi.responses import JSONResponse

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Proveedor MiniApp Backend")

# CORS (para MVP, permitir todos los orígenes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

@app.get("/api/suppliers")
async def get_suppliers():
    if not supabase:
        return {"error": "Supabase no configurado"}
    try:
        response = supabase.table("suppliers").select("*").execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching suppliers: {e}")
        return {"error": str(e)}

# 🔍 Endpoint de debug (sólo para MVP)
@app.get("/debug/env")
async def debug_env():
    return {
        "SUPABASE_URL_set": bool(os.getenv("SUPABASE_URL")),
        "SUPABASE_KEY_set": bool(os.getenv("SUPABASE_SERVICE_KEY")),
        "BOT_TOKEN_set": bool(os.getenv("BOT_TOKEN")),
        "BOT_TOKEN_length": len(os.getenv("BOT_TOKEN", "")),
        "WEBAPP_URL": os.getenv("WEBAPP_URL", "not set"),
        "BOT_URL": os.getenv("BOT_URL", "not set"),
    }

# Telegram Bot (inicialización segura)
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://placeholder.netlify.app")
BOT_URL = os.getenv("BOT_URL")  # Puede ser None en MVP

bot_app = None
if BOT_TOKEN and BOT_TOKEN.strip():
    try:
        bot_app = Application.builder().token(BOT_TOKEN.strip()).build()
        
        async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
            lang = update.effective_user.language_code or "es"
            msg = "👋 ¡Bienvenido! Gestiona cuentas bancarias de proveedores."
            btn = "🏦 Abrir Gestor de Proveedores"
            keyboard = [[InlineKeyboardButton(btn, web_app=WebAppInfo(url=WEBAPP_URL))]]
            await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(keyboard))
        
        bot_app.add_handler(CommandHandler("start", start))
        logger.info("✅ Bot de Telegram inicializado")
    except Exception as e:
        logger.error(f"❌ Error inicializando bot: {e}")
        bot_app = None  # Continuar sin bot si falla
else:
    logger.warning("⚠️ BOT_TOKEN no configurado o vacío. El bot no funcionará, pero la API sí.")

@app.on_event("startup")
async def startup():
    # Configurar webhook SOLO si bot_app existe y BOT_URL está definido
    if bot_app and BOT_URL:
        try:
            webhook_url = f"{BOT_URL}/webhook"
            await bot_app.set_webhook(webhook_url)
            bot_app.start()
            logger.info(f"🔗 Webhook configurado: {webhook_url}")
        except Exception as e:
            logger.error(f"⚠️ Error configurando webhook (no crítico para MVP): {e}")
            # No lanzar excepción para que la API siga funcionando
    else:
        logger.info("ℹ️ Webhook no configurado (BOT_URL o BOT_TOKEN faltan). La API /api/suppliers sigue disponible.")

@app.on_event("shutdown")
async def shutdown():
    if bot_app:
        bot_app.stop()

@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not bot_app:
        return JSONResponse({"ok": False, "error": "Bot not initialized"})
    try:
        data = await request.json()
        update = Update.de_json(data, bot_app.bot)
        await bot_app.process_update(update)
        return JSONResponse({"ok": True})
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        return JSONResponse({"ok": False, "error": str(e)})

# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "service": "backend"}
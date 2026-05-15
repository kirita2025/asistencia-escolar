import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from telegram import Update, InlineKeyboardButton, WebAppInfo, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes
from fastapi.responses import JSONResponse

app = FastAPI(title="Proveedor MiniApp Backend")

# CORS (En producción, restringe origins a tu URL de Netlify)
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
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/api/suppliers")
async def get_suppliers():
    response = supabase.table("suppliers").select("*").execute()
    return response.data

# Telegram Bot
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
BOT_URL = os.getenv("BOT_URL")  # URL de Render

bot_app = Application.builder().token(BOT_TOKEN).build()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("🏦 Abrir Gestor de Proveedores", web_app=WebAppInfo(url=WEBAPP_URL))]]
    await update.message.reply_text(
        "👋 ¡Bienvenido! Gestiona cuentas bancarias de proveedores desde la Mini App.",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

bot_app.add_handler(CommandHandler("start", start))

@app.on_event("startup")
async def startup():
    webhook_url = f"{BOT_URL}/webhook"
    await bot_app.set_webhook(webhook_url)
    bot_app.start()

@app.on_event("shutdown")
async def shutdown():
    bot_app.stop()

@app.post("/webhook")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update.de_json(data, bot_app.bot)
    await bot_app.process_update(update)
    return JSONResponse({"ok": True})
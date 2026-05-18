// ==================== CONFIGURACIÓN ====================
const API = 'https://bot-proveedores-backend.onrender.com/api';
const tg = window.Telegram.WebApp;
let user = null;
let alumnos = [];
let fechaSel = new Date().toISOString().split('T')[0];

const estados = {
    P: { icon: '✅', label: 'Presente', cls: 'sel-p' },
    A: { icon: '❌', label: 'Ausente', cls: 'sel-a' },
    T: { icon: '⏰', label: 'Tardanza', cls: 'sel-t' },
    J: { icon: '📝', label: 'Justificado', cls: 'sel-j' },
    E: { icon: '🚌', label: 'Excursión', cls: 'sel-e' }
};

// ==================== DEBUG ====================
function log(msg) {
    console.log(msg);
    const debugEl = document.getElementById('debug-log');
    if (debugEl) {
        debugEl.style.display = 'block';
        debugEl.innerHTML += msg + '<br>';
        debugEl.scrollTop = debugEl.scrollHeight;
    }
}

// ==================== INICIALIZACIÓN ====================
function init() {
    log('🚀 Iniciando Mini App...');
    
    try {
        tg.ready();
        tg.expand();
        log('✅ Telegram WebApp ready');
    } catch (e) {
        log('⚠️ No estamos en Telegram: ' + e.message);
    }
    
    actualizarHora();
    setInterval(actualizarHora, 1000);
    
    // Event listeners
    const inputFecha = document.getElementById('fecha-input');
    if (inputFecha) {
        inputFecha.value = fechaSel;
        inputFecha.addEventListener('input', onFechaChange);
        inputFecha.addEventListener('change', onFechaChange);
        log('✅ Fecha input configurado');
    }
    
    const btnHoy = document.getElementById('btn-hoy');
    if (btnHoy) {
        btnHoy.addEventListener('click', irAHoy);
        btnHoy.addEventListener('touchend', function(e) {
            e.preventDefault();
            irAHoy();
        });
        log('✅ Botón Hoy configurado');
    }
    
    const btnCargar = document.getElementById('btn-cargar');
    if (btnCargar) {
        btnCargar.addEventListener('click', cargar);
        btnCargar.addEventListener('touchend', function(e) {
            e.preventDefault();
            cargar();
        });
        log('✅ Botón Cargar configurado');
    }
    
    const btnGuardar = document.getElementById('btn-guardar');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardar);
        log('✅ Botón Guardar configurado');
    }
    
    const btnStats = document.getElementById('btn-stats');
    if (btnStats) {
        btnStats.addEventListener('click', stats);
        log('✅ Botón Stats configurado');
    }
    
    actualizarFecha();
    
    // Autenticar y cargar
    auth().then(() => {
        log('✅ Auth OK, verificando conexión...');
        verificarConexion();
        cargarFiltros();
    }).catch(err => {
        log('❌ Error init: ' + err.message);
        mostrarError('Error de conexión. Intentá de nuevo.');
    });
}

function onFechaChange(e) {
    fechaSel = e.target.value;
    actualizarFecha();
    cargar();
}

function actualizarHora() {
    const el = document.getElementById('hora');
    if (el) el.textContent = new Date().toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
}

async function auth() {
    try {
        log('🔑 Autenticando...');
        const initData = tg.initData || '';
        log('initData length: ' + initData.length);
        
        // Modo desarrollo: si no hay initData, permitir acceso
        if (!initData && !window.location.href.includes('telegram')) {
            log('⚠️ Modo desarrollo - sin initData');
            user = { id: 0, first_name: 'Dev' };
            return;
        }
        
        const r = await fetch(`${API}/auth`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({initData: initData})
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'No auth');
        user = d.user;
        log('✅ Autenticado: ' + user.first_name);
    } catch (e) {
        log('❌ Auth error: ' + e.message);
        // En desarrollo, no bloquear
        if (window.location.hostname.includes('localhost') || 
            window.location.hostname.includes('vercel.app')) {
            log('⚠️ Modo dev - continuando sin auth');
            user = { id: 0, first_name: 'Dev' };
            return;
        }
        document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>⛔ Acceso denegado</h2><p>Solo el maestro autorizado puede usar esta app.</p></div>';
        throw e;
    }
}

async function verificarConexion() {
    try {
        log('📡 Verificando conexión a: ' + API + '/');
        const r = await fetch(`${API}/`, {
            method: 'GET',
            headers: {'Accept': 'application/json'}
        });
        const d = await r.json();
        log('📡 Respuesta: ' + JSON.stringify(d));
        const badge = document.getElementById('modo-badge');
        if (badge) {
            badge.textContent = d.modo === 'online' ? '🟢 Online' : '🟡 Offline';
            badge.className = 'modo-badge ' + (d.modo === 'online' ? 'online' : 'offline');
        }
    } catch (e) {
        log('❌ Sin conexión: ' + e.message);
        const badge = document.getElementById('modo-badge');
        if (badge) {
            badge.textContent = '🔴 Sin conexión';
            badge.className = 'modo-badge offline';
        }
    }
}

function actualizarFecha() {
    const f = new Date(fechaSel + 'T00:00:00');
    const display = document.getElementById('fecha-display');
    if (display) display.textContent = f.toLocaleDateString('es-ES', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    
    const hoyStr = new Date().toISOString().split('T')[0];
    const hoyDate = new Date(hoyStr + 'T00:00:00');
    const selDate = new Date(fechaSel + 'T00:00:00');
    
    const badge = document.getElementById('solo-lectura');
    const btn = document.getElementById('btn-guardar');
    if (!badge || !btn) return;
    
    if (fechaSel === hoyStr) {
        badge.style.display = 'none';
        btn.disabled = false;
        btn.textContent = '💾 Guardar';
    } else if (selDate < hoyDate) {
        badge.style.display = 'block';
        badge.textContent = '👁️ Cargando asistencia histórica';
        btn.disabled = false;
        btn.textContent = '💾 Cargar atrasado';
    } else {
        badge.style.display = 'block';
        badge.textContent = '🔒 No se puede registrar asistencia futura';
        btn.disabled = true;
        btn.textContent = '🔒 Bloqueado';
    }
}

function irAHoy() {
    fechaSel = new Date().toISOString().split('T')[0];
    const input = document.getElementById('fecha-input');
    if (input) input.value = fechaSel;
    actualizarFecha();
    cargar();
}

async function cargarFiltros() {
    try {
        log('📥 Cargando filtros...');
        const r = await fetch(`${API}/alumnos`);
        const data = await r.json();
        const grados = [...new Set(data.map(a => a.grado))].sort();
        const secciones = [...new Set(data.map(a => a.seccion))].sort();
        const sg = document.getElementById('grado');
        const ss = document.getElementById('seccion');
        if (sg) {
            sg.innerHTML = '<option value="">Todos los grados</option>';
            grados.forEach(g => sg.add(new Option(g, g)));
        }
        if (ss) {
            ss.innerHTML = '<option value="">Todas</option>';
            secciones.forEach(s => ss.add(new Option('Sección ' + s, s)));
        }
        log('✅ Filtros cargados: ' + grados.length + ' grados, ' + secciones.length + ' secciones');
    } catch (e) { 
        log('❌ Error filtros: ' + e.message); 
    }
}

async function cargar() {
    const g = document.getElementById('grado')?.value || '';
    const s = document.getElementById('seccion')?.value || '';
    const lista = document.getElementById('lista');
    lista.innerHTML = '<div class="loading">⏳ Cargando alumnos...</div>';
    
    try {
        log('📥 Cargando alumnos... grado=' + g + ' seccion=' + s);
        const params = new URLSearchParams();
        if (g) params.append('grado', g);
        if (s) params.append('seccion', s);
        
        log('URL: ' + `${API}/alumnos?${params}`);
        const al = await (await fetch(`${API}/alumnos?${params}`)).json();
        log('✅ Alumnos recibidos: ' + al.length);
        
        const ap = new URLSearchParams();
        ap.append('fecha', fechaSel);
        if (g) ap.append('grado', g);
        if (s) ap.append('seccion', s);
        
        const asis = await (await fetch(`${API}/asistencia/hoy?${ap}`)).json();
        log('✅ Asistencia recibida: ' + (asis.asistencia || []).length + ' registros');
        
        const asisMap = {};
        (asis.asistencia || []).forEach(a => { 
            asisMap[a.alumno_id || a.id] = a.estado; 
        });
        
        alumnos = al.map(a => ({...a, estado: asisMap[a.id] || null}));
        renderizar();
        contar();
        log('✅ Renderizado completo');
    } catch (e) {
        log('❌ Error cargando: ' + e.message);
        mostrarError('Error: ' + e.message);
    }
}

function renderizar() {
    const container = document.getElementById('lista');
    if (!container) return;
    if (alumnos.length === 0) {
        container.innerHTML = '<div class="loading">No hay alumnos</div>';
        return;
    }
    container.innerHTML = '';
    alumnos.forEach((a, i) => {
        const ini = (a.nombre[0] + (a.apellido_paterno || a.apellido || '')[0]).toUpperCase();
        const card = document.createElement('div');
        card.className = 'card' + (a.estado ? ' completo' : '');
        card.style.animationDelay = (i * 0.03) + 's';
        
        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `<div><h3>${a.nombre} ${a.apellido_paterno||''} ${a.apellido_materno||''}</h3><span>Mat: ${a.matricula} · ${a.grado} ${a.seccion}</span></div><div class="foto">${ini}</div>`;
        
        const estadosDiv = document.createElement('div');
        estadosDiv.className = 'estados';
        
        ['P','A','T','J','E'].forEach(cod => {
            const btn = document.createElement('button');
            btn.innerHTML = `<span>${estados[cod].icon}</span><small>${estados[cod].label}</small>`;
            btn.className = a.estado === cod ? estados[cod].cls : '';
            
            const hoyStr = new Date().toISOString().split('T')[0];
            const hoyDate = new Date(hoyStr + 'T00:00:00');
            const selDate = new Date(fechaSel + 'T00:00:00');
            if (selDate > hoyDate) btn.disabled = true;
            
            // Eventos para Desktop y Mobile
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                marcar(a.id, cod, this);
            });
            
            // Para móviles Android con problemas de touch
            btn.addEventListener('touchend', function(e) {
                e.preventDefault();
                e.stopPropagation();
                marcar(a.id, cod, this);
            });
            
            estadosDiv.appendChild(btn);
        });
        
        card.appendChild(header);
        card.appendChild(estadosDiv);
        container.appendChild(card);
    });
}

function marcar(id, estado, btn) {
    log('📱 marcar(' + id + ', ' + estado + ')');
    const a = alumnos.find(x => x.id === id);
    if (!a) return;
    a.estado = estado;
    const card = btn.closest('.card');
    if (card) {
        card.querySelectorAll('button').forEach(b => b.className = '');
        btn.classList.add(estados[estado].cls);
        card.classList.add('completo');
    }
    contar();
    if (navigator.vibrate) navigator.vibrate(10);
}

function contar() {
    const p = alumnos.filter(a => a.estado === 'P').length;
    const au = alumnos.filter(a => a.estado === 'A').length;
    const t = alumnos.filter(a => a.estado === 'T').length;
    const j = alumnos.filter(a => a.estado === 'J').length;
    const e = alumnos.filter(a => a.estado === 'E').length;
    const pend = alumnos.filter(a => !a.estado).length;
    const ids = ['c-p','c-a','c-t','c-j','c-e','c-pend'];
    const vals = [p, au, t, j, e, pend];
    ids.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) el.textContent = vals[idx];
    });
}

async function guardar() {
    const regs = alumnos.filter(a => a.estado).map(a => ({
        alumno_id: a.id, 
        fecha: fechaSel, 
        estado: a.estado,
        hora: new Date().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}),
        user_id: user?.id || 0
    }));
    
    if (!regs.length) { 
        tg.showAlert('No hay asistencia para guardar'); 
        return; 
    }
    
    const btn = document.getElementById('btn-guardar');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';
    
    try {
        const r = await fetch(`${API}/asistencia/registrar`, {
            method: 'POST', 
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({registros: regs, user_id: user?.id || 0})
        });
        const d = await r.json();
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = d.modo === 'online' ? `✅ Guardado (${d.registros} registros)` : `💾 ${d.mensaje||'Guardado'}`;
            toast.style.background = d.modo === 'online' ? '#1a1a1a' : '#ff9800';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
        log('✅ Guardado: ' + JSON.stringify(d));
    } catch (e) {
        log('❌ Error guardando: ' + e.message);
        tg.showAlert('Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function stats() {
    const p = alumnos.filter(a => a.estado === 'P').length;
    const au = alumnos.filter(a => a.estado === 'A').length;
    const t = alumnos.filter(a => a.estado === 'T').length;
    const j = alumnos.filter(a => a.estado === 'J').length;
    const e = alumnos.filter(a => a.estado === 'E').length;
    const total = alumnos.length;
    const ft = document.getElementById('fecha-display')?.textContent || fechaSel;
    alert(`📊 ${ft}\n\n✅ Presentes: ${p}\n❌ Ausentes: ${au}\n⏰ Tardanzas: ${t}\n📝 Justificados: ${j}\n🚌 Excursiones: ${e}\n\nTotal: ${total} alumnos`);
}

function mostrarError(msg) {
    const lista = document.getElementById('lista');
    if (lista) lista.innerHTML = `<div class="error">${msg}</div>`;
}

// ==================== INICIAR ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
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

// ==================== INICIALIZACIÓN ====================
function init() {
    console.log('🚀 Iniciando Mini App...');
    
    try {
        tg.ready();
        tg.expand();
        console.log('✅ Telegram WebApp ready');
    } catch (e) {
        console.log('⚠️ No estamos en Telegram: ' + e.message);
    }
    
    actualizarHora();
    setInterval(actualizarHora, 1000);
    
    // Event listeners - FECHA
    const inputFecha = document.getElementById('fecha-input');
    if (inputFecha) {
        inputFecha.value = fechaSel;
        inputFecha.addEventListener('input', onFechaChange);
        inputFecha.addEventListener('change', onFechaChange);
        console.log('✅ Fecha input configurado');
    }
    
    // Botón HOY
    const btnHoy = document.getElementById('btn-hoy');
    if (btnHoy) {
        btnHoy.addEventListener('click', irAHoy);
        btnHoy.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            irAHoy();
        }, {passive: false});
        console.log('✅ Botón Hoy configurado');
    }
    
    // Botón CARGAR
    const btnCargar = document.getElementById('btn-cargar');
    if (btnCargar) {
        btnCargar.addEventListener('click', cargar);
        btnCargar.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            cargar();
        }, {passive: false});
        console.log('✅ Botón Cargar configurado');
    }
    
    // Botón GUARDAR
    const btnGuardar = document.getElementById('btn-guardar');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardar);
        console.log('✅ Botón Guardar configurado');
    }
    
    // Botón STATS
    const btnStats = document.getElementById('btn-stats');
    if (btnStats) {
        btnStats.addEventListener('click', stats);
        console.log('✅ Botón Stats configurado');
    }
    
    // 🔍 NUEVO: Búsqueda
    const busquedaInput = document.getElementById('busqueda-input');
    if (busquedaInput) {
        busquedaInput.addEventListener('input', filtrarBusqueda);
        console.log('✅ Búsqueda configurada');
    }
    
    // ✅ NUEVO: "Marcar todos presentes"
    const btnTodosP = document.getElementById('btn-todos-presentes');
    if (btnTodosP) {
        btnTodosP.addEventListener('click', marcarTodosPresentes);
        btnTodosP.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            marcarTodosPresentes();
        }, {passive: false});
        console.log('✅ Botón Todos Presentes configurado');
    }
    
    actualizarFecha();
    
    // Autenticar y cargar datos
    auth().then(() => {
        console.log('✅ Auth OK, verificando conexión...');
        verificarConexion();
        cargarFiltros();
    }).catch(err => {
        console.log('❌ Error init: ' + err.message);
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
        console.log('🔑 Autenticando...');
        const initData = tg.initData || '';
        console.log('initData length: ' + initData.length);
        
        // Modo desarrollo: si no hay initData y estamos en localhost o preview de Vercel
        const hostname = window.location.hostname;
        if (!initData && (hostname === 'localhost' || hostname.includes('vercel.app'))) {
            console.log('⚠️ Modo desarrollo - sin initData');
            user = { id: 0, first_name: 'Dev' };
            return;
        }
        
        const r = await fetch(API + '/auth', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({initData: initData})
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'No auth');
        user = d.user;
        console.log('✅ Autenticado: ' + user.first_name);
    } catch (e) {
        console.log('❌ Auth error: ' + e.message);
        // En desarrollo, no bloquear
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname.includes('vercel.app')) {
            console.log('⚠️ Modo dev - continuando sin auth');
            user = { id: 0, first_name: 'Dev' };
            return;
        }
        document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>⛔ Acceso denegado</h2><p>Solo el maestro autorizado puede usar esta app.</p></div>';
        throw e;
    }
}

async function verificarConexion() {
    try {
        console.log('📡 Verificando conexión a: ' + API + '/');
        const r = await fetch(API + '/', {
            method: 'GET',
            headers: {'Accept': 'application/json'}
        });
        const d = await r.json();
        console.log('📡 Respuesta: ' + JSON.stringify(d));
        const badge = document.getElementById('modo-badge');
        if (badge) {
            badge.textContent = d.modo === 'online' ? '🟢 Online' : '🟡 Offline';
            badge.className = 'modo-badge ' + (d.modo === 'online' ? 'online' : 'offline');
        }
    } catch (e) {
        console.log('❌ Sin conexión: ' + e.message);
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
        console.log('📥 Cargando filtros...');
        const r = await fetch(API + '/alumnos');
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
        console.log('✅ Filtros cargados: ' + grados.length + ' grados, ' + secciones.length + ' secciones');
    } catch (e) { 
        console.log('❌ Error filtros: ' + e.message); 
    }
}

async function cargar() {
    const g = document.getElementById('grado')?.value || '';
    const s = document.getElementById('seccion')?.value || '';
    const lista = document.getElementById('lista');
    lista.innerHTML = '<div class="loading">⏳ Cargando alumnos...</div>';
    
    // Mostrar barra de búsqueda
    const busquedaContainer = document.getElementById('busqueda-container');
    if (busquedaContainer) busquedaContainer.style.display = 'flex';
    
    try {
        console.log('📥 Cargando alumnos... grado=' + g + ' seccion=' + s);
        const params = new URLSearchParams();
        if (g) params.append('grado', g);
        if (s) params.append('seccion', s);
        
        console.log('URL alumnos: ' + API + '/alumnos?' + params.toString());
        const al = await (await fetch(API + '/alumnos?' + params.toString())).json();
        console.log('✅ Alumnos recibidos: ' + al.length);
        
        const ap = new URLSearchParams();
        ap.append('fecha', fechaSel);
        if (g) ap.append('grado', g);
        if (s) ap.append('seccion', s);
        
        console.log('URL asistencia: ' + API + '/asistencia/hoy?' + ap.toString());
        const asis = await (await fetch(API + '/asistencia/hoy?' + ap.toString())).json();
        console.log('✅ Asistencia recibida: ' + (asis.asistencia || []).length + ' registros');
        
        const asisMap = {};
        (asis.asistencia || []).forEach(a => { 
            asisMap[a.alumno_id || a.id] = a.estado; 
        });
        
        alumnos = al.map(a => ({...a, estado: asisMap[a.id] || null}));
        renderizar();
        contar();
        console.log('✅ Renderizado completo: ' + alumnos.length + ' alumnos');
    } catch (e) {
        console.log('❌ Error cargando: ' + e.message);
        mostrarError('Error: ' + e.message);
    }
}

// 🔍 NUEVO: Filtrar alumnos por búsqueda
function filtrarBusqueda() {
    const texto = document.getElementById('busqueda-input').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
        const nombre = card.querySelector('h3')?.textContent.toLowerCase() || '';
        const matricula = card.querySelector('span')?.textContent.toLowerCase() || '';
        
        if (texto === '' || nombre.includes(texto) || matricula.includes(texto)) {
            card.style.display = '';
            card.classList.remove('destacado');
        } else {
            card.style.display = 'none';
        }
    });
    
    // Destacar coincidencias si hay pocos resultados
    if (texto.length > 0) {
        const visibles = document.querySelectorAll('.card[style=""]');
        if (visibles.length === 1) {
            visibles[0].classList.add('destacado');
        }
    }
}

// ✅ NUEVO: Marcar todos como presentes
function marcarTodosPresentes() {
    const hoyStr = new Date().toISOString().split('T')[0];
    const hoyDate = new Date(hoyStr + 'T00:00:00');
    const selDate = new Date(fechaSel + 'T00:00:00');
    
    if (selDate > hoyDate) {
        tg.showAlert('No se puede marcar asistencia futura');
        return;
    }
    
    let marcados = 0;
    alumnos.forEach(a => {
        if (!a.estado) {
            a.estado = 'P';
            marcados++;
        }
    });
    
    // Re-renderizar para mostrar los cambios
    renderizar();
    contar();
    
    // Feedback
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = '✅ ' + marcados + ' alumnos marcados presentes';
        toast.style.background = '#4caf50';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    if (navigator.vibrate) navigator.vibrate(20);
    console.log('✅ Marcados ' + marcados + ' alumnos como presentes');
}

function renderizar() {
    const container = document.getElementById('lista');
    if (!container) return;
    if (alumnos.length === 0) {
        container.innerHTML = '<div class="loading">No hay alumnos para este filtro</div>';
        return;
    }
    container.innerHTML = '';
    alumnos.forEach((a, i) => {
        const ini = (a.nombre[0] + (a.apellido_paterno || a.apellido || '')[0]).toUpperCase();
        const card = document.createElement('div');
        card.className = 'card' + (a.estado ? ' completo' : '');
        card.style.animationDelay = (i * 0.05) + 's';
        
        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = '<div><h3>' + a.nombre + ' ' + (a.apellido_paterno||'') + ' ' + (a.apellido_materno||'') + '</h3><span>Mat: ' + a.matricula + ' · ' + a.grado + ' ' + a.seccion + '</span></div><div class="foto">' + ini + '</div>';
        
        const estadosDiv = document.createElement('div');
        estadosDiv.className = 'estados';
        
        ['P','A','T','J','E'].forEach(cod => {
            const btn = document.createElement('button');
            btn.innerHTML = '<span>' + estados[cod].icon + '</span><small>' + estados[cod].label + '</small>';
            btn.className = a.estado === cod ? estados[cod].cls : '';
            
            const hoyStr = new Date().toISOString().split('T')[0];
            const hoyDate = new Date(hoyStr + 'T00:00:00');
            const selDate = new Date(fechaSel + 'T00:00:00');
            if (selDate > hoyDate) btn.disabled = true;
            
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                marcar(a.id, cod, this);
            });
            
            btn.addEventListener('touchend', function(e) {
                e.preventDefault();
                e.stopPropagation();
                marcar(a.id, cod, this);
            }, {passive: false});
            
            estadosDiv.appendChild(btn);
        });
        
        card.appendChild(header);
        card.appendChild(estadosDiv);
        container.appendChild(card);
    });
    
    // Re-aplicar filtro de búsqueda si hay texto
    const busquedaTexto = document.getElementById('busqueda-input')?.value || '';
    if (busquedaTexto) filtrarBusqueda();
}

function marcar(id, estado, btn) {
    console.log('📱 marcar(' + id + ', ' + estado + ')');
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
    if (navigator.vibrate) navigator.vibrate(15);
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
        console.log('💾 Guardando ' + regs.length + ' registros...');
        const r = await fetch(API + '/asistencia/registrar', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({registros: regs, user_id: user?.id || 0})
        });
        const d = await r.json();
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = d.modo === 'online' ? '✅ Guardado (' + d.registros + ' registros)' : '💾 ' + (d.mensaje||'Guardado');
            toast.style.background = d.modo === 'online' ? '#1a1a1a' : '#ff9800';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
        console.log('✅ Guardado: ' + JSON.stringify(d));
    } catch (e) {
        console.log('❌ Error guardando: ' + e.message);
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
    tg.showAlert('📊 ' + ft + '\n\n✅ Presentes: ' + p + '\n❌ Ausentes: ' + au + '\n⏰ Tardanzas: ' + t + '\n📝 Justificados: ' + j + '\n🚌 Excursiones: ' + e + '\n\nTotal: ' + total + ' alumnos');
}

function mostrarError(msg) {
    const lista = document.getElementById('lista');
    if (lista) lista.innerHTML = '<div class="error">' + msg + '</div>';
}

// ==================== INICIAR ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
// ✅ URL del backend con prefijo /api para todos los endpoints
const API = 'https://bot-proveedores-backend.onrender.com/api';
const tg = window.Telegram.WebApp;
let user = null, alumnos = [], fechaSel = new Date().toISOString().split('T')[0];

const estados = {
    P: { icon: '✅', label: 'Presente', cls: 'sel-p' },
    A: { icon: '❌', label: 'Ausente', cls: 'sel-a' },
    T: { icon: '⏰', label: 'Tardanza', cls: 'sel-t' },
    J: { icon: '📝', label: 'Justificado', cls: 'sel-j' },
    E: { icon: '🚌', label: 'Excursión', cls: 'sel-e' }
};

document.addEventListener('DOMContentLoaded', async () => {
    tg.ready(); tg.expand();
    document.getElementById('fecha-input').value = fechaSel;
    actualizarFecha();
    setInterval(() => {
        document.getElementById('hora').textContent = new Date().toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
    }, 1000);
    
    await auth();
    await verificarConexion();
    await cargarFiltros();
});

async function auth() {
    try {
        const r = await fetch(`${API}/auth`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({initData: tg.initData})
        });
        const d = await r.json();
        if (!d.success) throw new Error('No auth');
        user = d.user;
    } catch (e) {
        document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>⛔ Acceso denegado</h2></div>';
    }
}

async function verificarConexion() {
    try {
        const r = await fetch(`${API}/`);
        const d = await r.json();
        const badge = document.getElementById('modo-badge');
        badge.textContent = d.modo === 'online' ? '🟢 Online' : '🟡 Offline';
        badge.className = 'modo-badge ' + (d.modo === 'online' ? 'online' : 'offline');
    } catch (e) {
        document.getElementById('modo-badge').textContent = '🔴 Sin conexión';
    }
}

function actualizarFecha() {
    const f = new Date(fechaSel + 'T00:00:00');
    document.getElementById('fecha-display').textContent = f.toLocaleDateString('es-ES', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    
    const hoy = new Date().toISOString().split('T')[0];
    const badge = document.getElementById('solo-lectura');
    const btn = document.getElementById('btn-guardar');
    
    if (fechaSel === hoy) {
        badge.style.display = 'none'; btn.disabled = false; btn.textContent = '💾 Guardar';
    } else if (fechaSel < hoy) {
        badge.style.display = 'block'; badge.textContent = '👁️ Cargando asistencia histórica';
        btn.disabled = false; btn.textContent = '💾 Cargar atrasado';
    } else {
        badge.style.display = 'block'; badge.textContent = '🔒 No se puede registrar asistencia futura';
        btn.disabled = true; btn.textContent = '🔒 Bloqueado';
    }
}

document.getElementById('fecha-input').addEventListener('change', e => {
    fechaSel = e.target.value; actualizarFecha(); cargar();
});

function irAHoy() {
    fechaSel = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-input').value = fechaSel;
    actualizarFecha(); cargar();
}

async function cargarFiltros() {
    const data = await (await fetch(`${API}/alumnos`)).json();
    const grados = [...new Set(data.map(a => a.grado))].sort();
    const secciones = [...new Set(data.map(a => a.seccion))].sort();
    
    const sg = document.getElementById('grado');
    grados.forEach(g => sg.add(new Option(g, g)));
    
    const ss = document.getElementById('seccion');
    secciones.forEach(s => ss.add(new Option('Sección ' + s, s)));
}

async function cargar() {
    const g = document.getElementById('grado')?.value || '';
    const s = document.getElementById('seccion')?.value || '';
    
    // Mostrar loader en la UI
    const lista = document.getElementById('lista');
    lista.innerHTML = '<div class="loading">⏳ Cargando alumnos...</div>';
    
    try {
        // 1. Alumnos
        const params = new URLSearchParams();
        if (g) params.append('grado', g);
        if (s) params.append('seccion', s);
        const al = await (await fetch(`${API}/alumnos?${params}`)).json();
        
        // 2. Asistencia del día
        const ap = new URLSearchParams();
        ap.append('fecha', fechaSel);
        if (g) ap.append('grado', g);
        if (s) ap.append('seccion', s);
        const asis = await (await fetch(`${API}/asistencia/hoy?${ap}`)).json();
        
        // 3. Combinar datos
        const asisMap = {};
        (asis.asistencia || []).forEach(a => {
            asisMap[a.alumno_id || a.id] = a.estado;
        });
        
        alumnos = al.map(a => ({...a, estado: asisMap[a.id] || null}));
        
        renderizar();
        contar();
    } catch (e) {
        console.error('❌ Error cargando:', e);
        lista.innerHTML = `<div class="error">Error al cargar: ${e.message}</div>`;
    }
}

function renderizar() {
    const container = document.getElementById('lista');
    container.innerHTML = '';
    
    alumnos.forEach((a, i) => {
        const ini = (a.nombre[0] + (a.apellido_paterno || a.apellido || '')[0]).toUpperCase();
        const card = document.createElement('div');
        card.className = 'card' + (a.estado ? ' completo' : '');
        card.style.animationDelay = (i * 0.03) + 's';
        
        let btns = '';
        // Se crean los botones:
        ['P','A','T','J','E'].forEach(cod => {  // ← Agregar 'E' aquí
            const sel = a.estado === cod ? estados[cod].cls : '';
            const dis = fechaSel > new Date().toISOString().split('T')[0] ? 'disabled' : '';
            btns += `<button class="${sel}" ${dis} onclick="marcar(${a.id}, '${cod}', this)"><span>${estados[cod].icon}</span><small>${estados[cod].label}</small></button>`;
        });
        
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3>${a.nombre} ${a.apellido_paterno || ''} ${a.apellido_materno || ''}</h3>
                    <span>Mat: ${a.matricula} · ${a.grado} ${a.seccion}</span>
                </div>
                <div class="foto">${ini}</div>
            </div>
            <div class="estados">${btns}</div>
        `;
        container.appendChild(card);
    });
}

function marcar(id, estado, btn) {
    const a = alumnos.find(x => x.id === id);
    a.estado = estado;
    
    const card = btn.closest('.card');
    card.querySelectorAll('button').forEach(b => b.className = '');
    btn.classList.add(estados[estado].cls);
    card.classList.add('completo');
    
    contar();
    if (navigator.vibrate) navigator.vibrate(10);
}

function contar() {
    document.getElementById('c-p').textContent = alumnos.filter(a => a.estado === 'P').length;
    document.getElementById('c-a').textContent = alumnos.filter(a => a.estado === 'A').length;
    document.getElementById('c-t').textContent = alumnos.filter(a => a.estado === 'T').length;
    document.getElementById('c-pend').textContent = alumnos.filter(a => !a.estado).length;
}

async function guardar() {
    const regs = alumnos.filter(a => a.estado).map(a => ({
        alumno_id: a.id,
        fecha: fechaSel,
        estado: a.estado,
        hora: new Date().toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}),
        user_id: user?.id || 0
    }));
    
    if (!regs.length) {
        tg.showAlert('⚠️ No hay asistencia para guardar');
        return;
    }
    
    // Feedback visual
    const btn = document.getElementById('btn-guardar');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';
    
    try {
        const r = await fetch(`${API}/asistencia/registrar`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({registros: regs, user_id: user?.id || 0})
        });
        const d = await r.json();
        
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = d.success 
                ? `✅ Guardado en la nube (${d.registros} registros)`
                : `⚠️ ${d.message || 'Error al guardar'}`;
            toast.style.background = d.success ? '#1a1a1a' : '#f44336';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    } catch (e) {
        console.error('❌ Error guardando:', e);
        tg.showAlert('Error al guardar: ' + e.message);
    } finally {
        // Restaurar botón
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
}

function stats() {
    const p = alumnos.filter(a => a.estado === 'P').length;
    const a = alumnos.filter(a => a.estado === 'A').length;
    const t = alumnos.filter(a => a.estado === 'T').length;
    const e = alumnos.filter(a => a.estado === 'E').length;  // ← NUEVO
    const j = alumnos.filter(a => a.estado === 'J').length;
    const total = alumnos.length;
    
    alert(`📊 ${document.getElementById('fecha-display').textContent}

✅ Presentes: ${p}
❌ Ausentes: ${a}
⏰ Tardanzas: ${t}
🚌 Excursiones: ${e}  // ← NUEVO
📝 Justificados: ${j}

Total: ${total} alumnos`);
}
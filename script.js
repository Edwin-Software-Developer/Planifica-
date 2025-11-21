/* Planifica+ - script.js
  - Soporta mensual/quincenal (si quincenal -> periods = meses * 2)
  - Guarda registros completos en localStorage (incluye evidencias como Data URLs)
  - Chart.js para gráfica de línea
  - Preview de evidencias en modal
*/

const calcularBtn = document.getElementById('calcularBtn');
const guardarBtn = document.getElementById('guardarBtn');
const resetBtn = document.getElementById('resetBtn');

const resumen = document.getElementById('resumen');
const metaText = document.getElementById('metaText');
const metaTotalText = document.getElementById('metaTotalText');
const acumuladoText = document.getElementById('acumuladoText');
const progressBar = document.getElementById('progressBar');
const registrosDiv = document.getElementById('registros');
const evidencePreview = document.getElementById('evidencePreview');
const porcentajeText = document.getElementById('porcentajeText');

const modal = document.getElementById('modal');
const modalImg = document.getElementById('modalImg');
const closeModal = document.getElementById('closeModal');

let state = {
  ahorroPorPeriodo: 0,
  metaTotal: 0,
  periods: [],
  periodoCount: 0
};

let chart = null;

/* Cargar estado guardado si existe */
function loadFromStorage() {
  const saved = localStorage.getItem('planifica_state_v1');
  if (saved) {
    state = JSON.parse(saved);
    if (state && state.periods && state.periods.length) {
      showResumen();
      renderRegistros();
      initChart();
      updateProgress();
    }
  }
}
loadFromStorage();

/* Eventos */
calcularBtn.addEventListener('click', onCalcular);
guardarBtn.addEventListener('click', () => {
  localStorage.setItem('planifica_state_v1', JSON.stringify(state));
  toast('Guardado localmente ✅');
});
resetBtn.addEventListener('click', () => {
  if (!confirm('¿Deseas reiniciar el plan? Se perderán los datos locales.')) return;
  localStorage.removeItem('planifica_state_v1');
  state = { ahorroPorPeriodo:0, metaTotal:0, periods:[], periodoCount:0 };
  registrosDiv.innerHTML = '';
  if (chart) { chart.destroy(); chart = null; }
  resumen.classList.add('hidden');
  evidencePreview.innerHTML = '';
});

/* Modal preview */
closeModal.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

/* Toaster simple */
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.className = 'fixed bottom-8 right-8 bg-slate-800 text-white px-4 py-2 rounded shadow-lg';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2200);
}

/* Acción calcular */
function onCalcular() {
  const sueldo = Number(document.getElementById('sueldo').value) || 0;
  const fijos = Number(document.getElementById('gastosFijos').value) || 0;
  const ocio = Number(document.getElementById('gastosOcio').value) || 0;
  const porcentaje = Number(document.getElementById('porcentaje').value) || 0;
  const meses = Math.max(1, Number(document.getElementById('meses').value) || 1);
  const periodoTipo = document.getElementById('periodo').value;

  const sobrante = Math.max(0, sueldo - (fijos + ocio));
  const ahorroMensual = sobrante * (porcentaje / 100);

  // Si quincenal: cada mes tiene 2 periodos
  const periodoCount = periodoTipo === 'quincenal' ? meses * 2 : meses;
  const ahorroPorPeriodo = periodoTipo === 'quincenal' ? (ahorroMensual / 2) : ahorroMensual;
  const metaTotal = ahorroMensual * meses;

  // Generar array de periodos si no existe o si count cambió
  const periods = Array.from({ length: periodoCount }, (_, i) => {
    // Si ya existía periodo previo y tiene datos, conservarlos
    const prev = state.periods && state.periods[i] ? state.periods[i] : null;
    return prev ? prev : { index: i+1, ahorro: 0, evidencia: null };
  });

  state.ahorroPorPeriodo = round2(ahorroPorPeriodo);
  state.metaTotal = round2(metaTotal);
  state.periods = periods;
  state.periodoCount = periodoCount;

  showResumen();
  renderRegistros();
  initChart();
  updateProgress();

  // Guardar provisional
  localStorage.setItem('planifica_state_v1', JSON.stringify(state));
}

/* UI resumen */
function showResumen() {
  resumen.classList.remove('hidden');
  metaText.textContent = `RD$ ${formatMoney(state.ahorroPorPeriodo)} por periodo`;
  metaTotalText.textContent = `RD$ ${formatMoney(state.metaTotal)}`;
}

/* Render tarjetas de registros */
function renderRegistros() {
  registrosDiv.innerHTML = '';
  state.periods.forEach((p, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'registro';

    const left = document.createElement('div'); // etiqueta y meta
    left.innerHTML = `<div class="text-sm font-medium text-slate-700">Periodo ${p.index}</div>
                      <div class="text-xs text-slate-400">Meta RD$ ${formatMoney(state.ahorroPorPeriodo)}</div>`;

    const center = document.createElement('div');
    center.style.display = 'flex';
    center.style.alignItems = 'center';
    center.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.placeholder = 'Ahorrado (RD$)';
    input.value = p.ahorro || '';
    input.className = 'px-3 py-2 border rounded-md';
    input.style.width = '120px';
    input.addEventListener('input', e => {
      p.ahorro = Number(e.target.value) || 0;
      updateProgress();
      localStorage.setItem('planifica_state_v1', JSON.stringify(state));
    });

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*,application/pdf';
    file.addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      // Leer como dataURL (para demo local). En una app real subir a storage.
      const data = await fileToDataURL(f);
      p.evidencia = { name: f.name, dataUrl: data, type: f.type };
      updateEvidencePreview();
      localStorage.setItem('planifica_state_v1', JSON.stringify(state));
      toast('Evidencia guardada (local) ✅');
    });

    center.appendChild(input);
    center.appendChild(file);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.alignItems = 'end';
    right.style.gap = '6px';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'text-sm text-slate-500';
    metaSpan.textContent = `RD$ ${formatMoney(p.ahorro || 0)}`;

    const check = document.createElement('button');
    check.className = 'text-xs px-3 py-1 rounded-md border';
    check.textContent = p.ahorro >= state.ahorroPorPeriodo ? 'Completado' : 'Marcar';
    check.addEventListener('click', () => {
      if (p.ahorro < state.ahorroPorPeriodo) {
        p.ahorro = state.ahorroPorPeriodo;
        input.value = p.ahorro;
        metaSpan.textContent = `RD$ ${formatMoney(p.ahorro)}`;
      } else {
        p.ahorro = 0;
        input.value = '';
        metaSpan.textContent = `RD$ 0.00`;
      }
      updateProgress();
      localStorage.setItem('planifica_state_v1', JSON.stringify(state));
    });

    right.appendChild(metaSpan);
    right.appendChild(check);

    wrapper.appendChild(left);
    wrapper.appendChild(center);
    wrapper.appendChild(right);

    registrosDiv.appendChild(wrapper);
  });

  updateEvidencePreview();
}

/* Convertir file a dataURL */
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

/* Evidences grid */
function updateEvidencePreview() {
  evidencePreview.innerHTML = '';
  state.periods.forEach((p, idx) => {
    if (p.evidencia && p.evidencia.dataUrl) {
      const img = document.createElement('img');
      img.src = p.evidencia.dataUrl;
      img.title = `Periodo ${p.index} — ${p.evidencia.name}`;
      img.className = 'evidence-thumb';
      img.addEventListener('click', () => {
        modalImg.src = p.evidencia.dataUrl;
        modal.classList.remove('hidden');
      });
      evidencePreview.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'h-12 w-full rounded-md bg-slate-50 border border-dashed border-slate-100 flex items-center justify-center text-xs text-slate-300';
      placeholder.textContent = '—';
      evidencePreview.appendChild(placeholder);
    }
  });
}

/* Progreso y Chart */
function updateProgress() {
  const total = state.periods.reduce((s, p) => s + (Number(p.ahorro) || 0), 0);
  acumuladoText.textContent = `RD$ ${formatMoney(total)}`;

  const percent = state.metaTotal > 0 ? Math.min(100, (total / state.metaTotal) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  porcentajeText.textContent = `${Math.round(percent)}%`;

  // Actualizar small amount shown en cada tarjeta
  Array.from(registrosDiv.querySelectorAll('.registro')).forEach((node, i) => {
    const span = node.querySelector('div:last-child span');
    if (span) span.textContent = `RD$ ${formatMoney(state.periods[i].ahorro || 0)}`;
  });

  // Chart update
  if (chart) {
    chart.data.datasets[0].data = state.periods.map(p => round2(p.ahorro || 0));
    chart.update();
  }
}

/* Inicializar Chart.js */
function initChart() {
  const ctx = document.getElementById('chart').getContext('2d');
  if (chart) chart.destroy();

  const labels = state.periods.map(p => `P${p.index}`);
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ahorrado por periodo',
        data: state.periods.map(p => round2(p.ahorro || 0)),
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 4,
        backgroundColor: 'rgba(56,189,248,0.12)',
        borderColor: 'rgba(14,165,233,0.9)'
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => `RD$ ${formatMoney(v)}` }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* Utilidades */
function formatMoney(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* Inicializar carga si había datos (ya llamada arriba) */


    
    

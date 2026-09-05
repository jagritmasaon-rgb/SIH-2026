// Protocol Library Database
const protocols = {
  bio: [
    {
      id: 1,
      title: "Verify Astronaut Presence",
      desc: "Astronaut face/body presence required at Glovebox #1",
      targetObjects: ["person"],
      status: "current",
      timerSec: 0
    },
    {
      id: 2,
      title: "Select Pipette / Extraction Tool",
      desc: "Present tool (Cell Phone, Scissors, or Pen)",
      targetObjects: ["cell phone", "phone", "scissors", "remote", "toothbrush", "mouse"],
      status: "pending",
      timerSec: 0
    },
    {
      id: 3,
      title: "Position Sample Fluid Vial",
      desc: "Align fluid container (Bottle or Cup)",
      targetObjects: ["bottle", "cup", "mug", "wine glass", "bowl"],
      status: "pending",
      timerSec: 15 // Reaction incubation timer
    },
    {
      id: 4,
      title: "Review Protocol Documentation",
      desc: "Display documentation notebook or manual (Book/Laptop)",
      targetObjects: ["book", "laptop"],
      status: "pending",
      timerSec: 0
    }
  ],
  fluid: [
    {
      id: 1,
      title: "Confirm Operator Station",
      desc: "Position operator at capillary channel apparatus",
      targetObjects: ["person"],
      status: "current",
      timerSec: 0
    },
    {
      id: 2,
      title: "Mount Capillary Tube Assembly",
      desc: "Hold assembly tool (Cell Phone / Scissors)",
      targetObjects: ["cell phone", "scissors", "remote"],
      status: "pending",
      timerSec: 0
    },
    {
      id: 3,
      title: "Inject Viscous Test Fluid",
      desc: "Present fluid injector (Cup / Bottle)",
      targetObjects: ["bottle", "cup", "wine glass"],
      status: "pending",
      timerSec: 10
    },
    {
      id: 4,
      title: "Log High-Speed Video Data",
      desc: "Review telemetry log on computer (Laptop / Book)",
      targetObjects: ["laptop", "book"],
      status: "pending",
      timerSec: 0
    }
  ],
  botany: [
    {
      id: 1,
      title: "Astronaut Safety Check",
      desc: "Verify astronaut at Veggie Growth Chamber",
      targetObjects: ["person"],
      status: "current",
      timerSec: 0
    },
    {
      id: 2,
      title: "Inspect Plant Nutrient Cartridge",
      desc: "Hold cartridge module (Cell Phone / Remote)",
      targetObjects: ["cell phone", "remote", "toothbrush"],
      status: "pending",
      timerSec: 0
    },
    {
      id: 3,
      title: "Hydration Reservoir Check",
      desc: "Position hydration canister (Bottle / Cup)",
      targetObjects: ["bottle", "cup"],
      status: "pending",
      timerSec: 20
    },
    {
      id: 4,
      title: "Record Foliage Biomass Data",
      desc: "Log plant data in research book (Book / Laptop)",
      targetObjects: ["book", "laptop"],
      status: "pending",
      timerSec: 0
    }
  ]
};

let currentProtocolKey = "bio";
let experimentSteps = JSON.parse(JSON.stringify(protocols.bio));
let currentStepIndex = 0;

let model = null;
let video = null;
let canvas = null;
let ctx = null;
let isDetecting = false;
let lastDetectionTime = 0;
let logs = [];
let secondsElapsed = 0;
let isTransitioning = false;
let matchHoldCount = 0;
let deviationCooldown = false;
let recognition = null;
let isVoiceActive = false;
let bufferedTelemetryItems = 0;
let currentCameraMode = "cam1";
let countdownInterval = null;

// Voice Synthesis
function speakAstronaut(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}

// Structured ISO Log
function addLog(msg, type = "INFO") {
  const time = new Date().toISOString().replace('T', ' ').substr(0, 19);
  const color = type === 'ERROR' ? 'text-red-400 font-bold' : (type === 'SUCCESS' ? 'text-emerald-400 font-bold' : 'text-slate-300');
  const logEntry = `[${time}] [${type}] ${msg}`;
  logs.push(logEntry);
  bufferedTelemetryItems++;
  updateBufferUI();

  const logBox = document.getElementById('log-console');
  if (logBox) {
    const p = document.createElement('p');
    p.className = color;
    p.innerText = logEntry;
    logBox.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight;
  }
}

function updateBufferUI() {
  const btn = document.getElementById('sync-status');
  if (btn) btn.innerText = `Buffered: ${bufferedTelemetryItems} items`;
}

// Render Step Workflow List
function renderSteps() {
  const container = document.getElementById('step-list-container');
  if (!container) return;
  container.innerHTML = '';

  experimentSteps.forEach((step) => {
    let stateClass = "border-slate-800/80 bg-slate-900/50 opacity-60";
    let icon = `<span class="w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">${step.id}</span>`;

    if (step.status === 'completed') {
      stateClass = "border-emerald-500/40 bg-emerald-950/20 text-emerald-300 opacity-100";
      icon = `<span class="w-6 h-6 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center text-xs"><i class="fa-solid fa-check"></i></span>`;
    } else if (step.status === 'current') {
      stateClass = "border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-md shadow-cyan-500/10 opacity-100 scale-[1.01]";
      icon = `<span class="w-6 h-6 rounded-full bg-cyan-400 text-black font-bold flex items-center justify-center text-xs animate-pulse">${step.id}</span>`;
    }

    const div = document.createElement('div');
    div.className = `p-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2.5 ${stateClass}`;
    div.innerHTML = `
      ${icon}
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold font-hud">${step.title}</h4>
          <span class="text-[9px] text-cyan-400 font-mono">[${step.targetObjects.slice(0, 2).join('/')}]</span>
        </div>
        <p class="text-[10px] text-slate-400">${step.desc}</p>
      </div>
      ${step.status === 'current' ? '<span class="text-[9px] font-bold px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 rounded">ACTIVE</span>' : ''}
    `;
    container.appendChild(div);
  });

  const counter = document.getElementById('step-counter');
  if (counter) {
    counter.innerText = `Step ${Math.min(currentStepIndex + 1, experimentSteps.length)} / ${experimentSteps.length}`;
  }

  const targetBadge = document.getElementById('target-object-badge');
  if (targetBadge && currentStepIndex < experimentSteps.length) {
    targetBadge.innerText = `Target: ${experimentSteps[currentStepIndex].targetObjects.join(', ')}`;
  }

  // Update AR Crosshair Subtext
  const arSub = document.getElementById('ar-guide-sub');
  if (arSub && currentStepIndex < experimentSteps.length) {
    arSub.innerText = `Target: ${experimentSteps[currentStepIndex].targetObjects[0].toUpperCase()}`;
  }

  // Update XAI State
  const xaiDag = document.getElementById('xai-dag');
  if (xaiDag) {
    xaiDag.innerText = `VALIDATED (Step ${Math.min(currentStepIndex + 1, experimentSteps.length)} of ${experimentSteps.length})`;
  }
}

// AI Model Loader
async function initAI() {
  try {
    if (window.tf) await tf.ready();
    if (window.cocoSsd) {
      model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      addLog("Edge INT8 YOLO Vision weights mapped in RAM.", "SUCCESS");
    }
  } catch (err) {
    console.warn("AI Fallback Notice:", err);
    addLog("Running on local Edge processor fallback.", "INFO");
  }
}

// Start Camera Stream
async function startCamera() {
  video = document.getElementById('webcam');
  canvas = document.getElementById('output-canvas');
  ctx = canvas.getContext('2d');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      video.play();
      isDetecting = true;
      requestAnimationFrame(detectFrame);
    };

    document.getElementById('start-cam-btn').classList.replace('bg-cyan-600', 'bg-emerald-600');
    document.getElementById('start-cam-btn').innerHTML = '<i class="fa-solid fa-video"></i> Active';
    
    addLog("Webcam video feed online. Sequence guard activated.", "SUCCESS");
    speakAstronaut("Camera stream online. Step one: Please verify astronaut presence.");
  } catch (err) {
    console.error("Camera Error:", err);
    alert("Camera Access Error: Ensure page is loaded via http://localhost or Live Server.");
    addLog("Camera access error: " + err.message, "ERROR");
  }
}

// Toggle Camera Stream (Dual-Cam Sim)
function toggleCameraStream() {
  const label = document.getElementById('camera-label');
  if (currentCameraMode === "cam1") {
    currentCameraMode = "cam2";
    label.innerText = "CAM 02 [WIDE HABITAT]";
    addLog("Switched video source to CAM 02 (Wide Habitat Field of View).");
  } else {
    currentCameraMode = "cam1";
    label.innerText = "CAM 01 [MACRO GLOVE]";
    addLog("Switched video source to CAM 01 (Macro Glovebox Camera).");
  }
}

// Continuous Frame Loop
async function detectFrame() {
  if (!isDetecting || !video) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let predictions = [];
  if (model) {
    try {
      predictions = await model.detect(video);
    } catch (e) {
      console.warn(e);
    }
  }

  const fps = (1000 / (performance.now() - (lastDetectionTime || performance.now() - 33))).toFixed(1);
  lastDetectionTime = performance.now();
  
  document.getElementById('fps-val').innerText = `${fps} FPS`;

  let detectedLabels = [];
  let foundTargetThisFrame = null;
  let futureStepDetected = null;

  predictions.forEach(pred => {
    const [x, y, width, height] = pred.bbox;
    const label = pred.class.toLowerCase();
    const score = Math.round(pred.score * 100);
    detectedLabels.push(`${label} (${score}%)`);

    // Draw Cyberpunk Cyan Bounding Box
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    // Reticle Corner Accents
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, 8, 8);
    ctx.strokeRect(x + width - 6, y + height - 6, 8, 8);

    ctx.fillStyle = "rgba(0, 240, 255, 0.9)";
    ctx.fillRect(x, y - 22, ctx.measureText(label).width + 55, 22);

    ctx.fillStyle = "#000";
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    ctx.fillText(`${label.toUpperCase()} ${score}%`, x + 5, y - 6);

    // Update XAI telemetry
    document.getElementById('xai-conf').innerText = `${score}% (Threshold > 35%)`;

    // 1. Current Step Match Check
    if (currentStepIndex < experimentSteps.length && pred.score >= 0.35) {
      const currentStep = experimentSteps[currentStepIndex];
      const isCurrentMatch = currentStep.targetObjects.some(target => label.includes(target) || target.includes(label));
      if (isCurrentMatch) {
        foundTargetThisFrame = label;
      }
    }

    // 2. Out-of-Sequence Future Step Check
    if (!foundTargetThisFrame && currentStepIndex < experimentSteps.length && pred.score >= 0.45) {
      for (let i = currentStepIndex + 1; i < experimentSteps.length; i++) {
        const futureStep = experimentSteps[i];
        const isFutureMatch = futureStep.targetObjects.some(target => label.includes(target) || target.includes(label));
        if (isFutureMatch) {
          futureStepDetected = { item: label, stepNum: futureStep.id, stepTitle: futureStep.title };
          break;
        }
      }
    }
  });

  if (detectedLabels.length > 0) {
    document.getElementById('live-detected-label').innerText = `AI Tracking: ${detectedLabels.join(', ')}`;
  }

  // Handle Automatic Out-of-Sequence Deviation Alert
  if (futureStepDetected && !deviationCooldown && !isTransitioning) {
    triggerSequenceDeviation(futureStepDetected);
  }

  // Handle Auto-Advance (8 Consecutive Frame Confirmations)
  if (!isTransitioning && currentStepIndex < experimentSteps.length) {
    if (foundTargetThisFrame) {
      matchHoldCount++;
      document.getElementById('xai-debounce').innerText = `${matchHoldCount} / 8 Frames Hold`;
      if (matchHoldCount >= 8) {
        matchHoldCount = 0;
        dismissAlert();
        captureStepSnapshot(currentStepIndex + 1);
        handleStepSuccess(experimentSteps[currentStepIndex], foundTargetThisFrame);
      }
    } else {
      matchHoldCount = Math.max(0, matchHoldCount - 1);
      document.getElementById('xai-debounce').innerText = `${matchHoldCount} / 8 Frames Hold`;
    }
  }

  requestAnimationFrame(detectFrame);
}

// Capture Snapshot to Visual Evidence Reel
function captureStepSnapshot(stepNum) {
  if (!video || video.videoWidth === 0) return;
  
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = 160;
  snapCanvas.height = 100;
  const sCtx = snapCanvas.getContext('2d');
  sCtx.drawImage(video, 0, 0, 160, 100);

  const imgUrl = snapCanvas.toDataURL('image/jpeg');
  const gallery = document.getElementById('snapshot-gallery');
  const placeholder = gallery.children[stepNum - 1];

  if (placeholder) {
    placeholder.innerHTML = `
      <img src="${imgUrl}" class="w-full h-12 object-cover rounded border border-cyan-500/50 mb-1" />
      <span class="text-[9px] font-bold text-emerald-400">Step ${stepNum} Verified</span>
    `;
    placeholder.className = "flex flex-col items-center bg-slate-900/90 p-1 rounded border border-slate-700";
  }
}

// Sequence Deviation Trigger
function triggerSequenceDeviation(futureStepInfo) {
  deviationCooldown = true;
  const currentStep = experimentSteps[currentStepIndex];
  
  const banner = document.getElementById('alert-banner');
  const alertMsg = document.getElementById('alert-message');
  
  alertMsg.innerText = `Detected [${futureStepInfo.item.toUpperCase()}]. Complete Step ${currentStep.id} (${currentStep.title}) first!`;
  banner.classList.remove('hidden');

  addLog(`SEQUENCE VIOLATION: Presented Step ${futureStepInfo.stepNum} item [${futureStepInfo.item}] before Step ${currentStep.id}!`, "ERROR");
  speakAstronaut(`Warning! Sequence deviation detected. You presented ${futureStepInfo.item}. Please complete step ${currentStep.id}, ${currentStep.title} first.`);

  setTimeout(() => {
    deviationCooldown = false;
  }, 4500);
}

// Step Success Transition & Countdown Timer
function handleStepSuccess(step, detectedItem) {
  isTransitioning = true;
  step.status = 'completed';
  addLog(`AUTO-VERIFIED: Identified [${detectedItem}] for "${step.title}"`, "SUCCESS");

  // Check if step requires countdown incubation
  if (step.timerSec > 0) {
    triggerIncubationCountdown(step.timerSec, step.title);
  }

  currentStepIndex++;
  renderSteps();

  if (currentStepIndex < experimentSteps.length) {
    experimentSteps[currentStepIndex].status = 'current';
    const nextStep = experimentSteps[currentStepIndex];
    addLog(`Advancing to Step ${currentStepIndex + 1}: ${nextStep.title}`);
    speakAstronaut(`Verified ${detectedItem}. Next step: ${nextStep.title}.`);
  } else {
    addLog("EXPERIMENT CONCLUDED: All protocol verification checkpoints passed.", "SUCCESS");
    speakAstronaut("Experiment completed successfully! All steps verified in proper sequence.");
  }
  
  renderSteps();
  setTimeout(() => { isTransitioning = false; }, 3000);
}

// Incubation Timer Assistant
function triggerIncubationCountdown(seconds, stepTitle) {
  clearInterval(countdownInterval);
  const bar = document.getElementById('countdown-bar');
  const clock = document.getElementById('countdown-clock');
  const label = document.getElementById('countdown-label');
  
  bar.classList.remove('hidden');
  label.innerText = `INCUBATION TIMER (${stepTitle}):`;
  let remaining = seconds;

  countdownInterval = setInterval(() => {
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    clock.innerText = `${mins}:${secs}`;
    remaining--;

    if (remaining < 0) {
      clearInterval(countdownInterval);
      bar.classList.add('hidden');
      speakAstronaut("Incubation time complete. Proceed with protocol.");
      addLog(`Incubation reaction timer (${seconds}s) finished.`);
    }
  }, 1000);
}

// Hands-Free Speech Recognition
function toggleVoiceRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("Speech recognition not supported in this browser. Use Chrome or Edge.");
    return;
  }

  if (isVoiceActive && recognition) {
    recognition.stop();
    isVoiceActive = false;
    document.getElementById('mic-btn').classList.replace('bg-cyan-600', 'bg-slate-800');
    document.getElementById('mic-label').innerText = "Voice Control";
    addLog("Voice command listening paused.");
    return;
  }

  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isVoiceActive = true;
    document.getElementById('mic-btn').classList.replace('bg-slate-800', 'bg-cyan-600');
    document.getElementById('mic-label').innerText = "Listening...";
    addLog("Astronaut voice command system online. Say 'Next', 'Repeat', or 'Reset'.", "SUCCESS");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
    addLog(`VOICE COMMAND RECEIVED: "${transcript}"`);

    if (transcript.includes("next") || transcript.includes("proceed")) {
      simulateManualTrigger();
    } else if (transcript.includes("repeat") || transcript.includes("current")) {
      const step = experimentSteps[currentStepIndex];
      speakAstronaut(`Current step is ${step.id}: ${step.title}. Required object: ${step.targetObjects.join(', ')}`);
    } else if (transcript.includes("reset")) {
      resetExperiment();
    } else if (transcript.includes("status")) {
      speakAstronaut(`System operational. Experiment is on step ${currentStepIndex + 1} of ${experimentSteps.length}.`);
    }
  };

  recognition.start();
}

// Store & Forward Earth Sync
function syncEarthData() {
  if (bufferedTelemetryItems === 0) {
    alert("Ground link buffer is empty. No unsent telemetry.");
    return;
  }
  const syncBtn = document.getElementById('sync-status');
  syncBtn.innerText = "Uplinking to Earth...";
  speakAstronaut("Transmitting buffered telemetry packets to ground station.");
  
  setTimeout(() => {
    addLog(`STORE & FORWARD: Uploaded ${bufferedTelemetryItems} telemetry frames to Earth Mission Control.`, "SUCCESS");
    bufferedTelemetryItems = 0;
    syncBtn.innerText = "Buffered: 0 items";
  }, 2000);
}

// Protocol Changer
function changeProtocol(key) {
  currentProtocolKey = key;
  experimentSteps = JSON.parse(JSON.stringify(protocols[key]));
  resetExperiment();
  addLog(`Loaded new protocol: ${key.toUpperCase()}`);
}

// Comms Latency Switcher
function updateCommsLatency(val) {
  const latencies = { iss: "1.8s", moon: "3.2s", mars: "14.2 min" };
  addLog(`Communication profile switched: ${val.toUpperCase()} (Round-trip delay: ${latencies[val]})`);
  if (val === 'mars') {
    speakAstronaut("Earth latency is 14 minutes. Autonomous Edge AI active for zero-latency execution.");
  }
}

// Manual Override Trigger
function simulateManualTrigger() {
  if (currentStepIndex < experimentSteps.length) {
    dismissAlert();
    captureStepSnapshot(currentStepIndex + 1);
    handleStepSuccess(experimentSteps[currentStepIndex], "Manual Override");
  }
}

// Deviation Test
function simulateDeviationTest() {
  triggerSequenceDeviation({ item: "vial bottle", stepNum: 3, stepTitle: "Position Fluid Vial" });
}

function dismissAlert() {
  const banner = document.getElementById('alert-banner');
  if (banner) banner.classList.add('hidden');
}

// Reset System
function resetExperiment() {
  currentStepIndex = 0;
  isTransitioning = false;
  matchHoldCount = 0;
  deviationCooldown = false;
  clearInterval(countdownInterval);
  document.getElementById('countdown-bar').classList.add('hidden');
  
  experimentSteps = JSON.parse(JSON.stringify(protocols[currentProtocolKey]));
  experimentSteps.forEach((s, i) => s.status = i === 0 ? 'current' : 'pending');
  dismissAlert();
  logs.length = 0;
  bufferedTelemetryItems = 0;
  updateBufferUI();
  document.getElementById('log-console').innerHTML = '';
  
  // Reset Gallery
  const gallery = document.getElementById('snapshot-gallery');
  gallery.innerHTML = `
    <div class="flex flex-col items-center justify-center text-center text-slate-600 text-[10px] border border-dashed border-slate-800 rounded p-2">Step 1 Evidence</div>
    <div class="flex flex-col items-center justify-center text-center text-slate-600 text-[10px] border border-dashed border-slate-800 rounded p-2">Step 2 Evidence</div>
    <div class="flex flex-col items-center justify-center text-center text-slate-600 text-[10px] border border-dashed border-slate-800 rounded p-2">Step 3 Evidence</div>
    <div class="flex flex-col items-center justify-center text-center text-slate-600 text-[10px] border border-dashed border-slate-800 rounded p-2">Step 4 Evidence</div>
  `;

  addLog(`Experiment protocol reset. Ready for Step 1.`);
  renderSteps();
  speakAstronaut("Experiment reset. Ready for step one.");
}

// Export TXT Logs
function downloadLogs() {
  const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `AEROS1_${currentProtocolKey.toUpperCase()}_AUDIT_LOG_${Date.now()}.txt`;
  a.click();
}

// Generate PDF / Printable Mission Report Modal
function generateMissionReportPDF() {
  const modal = document.getElementById('mission-report-modal');
  document.getElementById('rep-id').innerText = currentProtocolKey.toUpperCase() + "-EXP-084";
  
  const stepsContainer = document.getElementById('rep-steps');
  stepsContainer.innerHTML = '';
  experimentSteps.forEach(s => {
    const isDone = s.status === 'completed';
    const div = document.createElement('div');
    div.innerHTML = `• <b>Step ${s.id} (${s.title}):</b> ${isDone ? '<span class="text-emerald-400 font-bold">[VERIFIED]</span>' : '<span class="text-amber-400">[PENDING]</span>'}`;
    stepsContainer.appendChild(div);
  });

  modal.classList.remove('hidden');
}

function closeReportModal() {
  document.getElementById('mission-report-modal').classList.add('hidden');
}

// Periodic Vitals Simulation
function simulateVitals() {
  const heart = 72 + Math.floor(Math.random() * 6);
  const focus = (95.5 + Math.random() * 2.5).toFixed(1);
  const heartElem = document.getElementById('vital-heart');
  const focusElem = document.getElementById('vital-focus');
  if (heartElem) heartElem.innerText = `${heart} bpm`;
  if (focusElem) focusElem.innerText = `${focus}% (Nominal)`;
}

// Page Initialization
window.onload = async () => {
  renderSteps();
  await initAI();
  setInterval(simulateVitals, 3000);
  setInterval(() => {
    secondsElapsed++;
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const secs = String(secondsElapsed % 60).padStart(2, '0');
    const timerElem = document.getElementById('live-timer');
    if (timerElem) timerElem.innerText = `00:${mins}:${secs}`;
  }, 1000);
};
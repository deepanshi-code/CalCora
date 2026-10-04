// --- GLOBAL APP MANAGER ---
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Offline support. Service workers need http(s) (or localhost); skip silently on file://.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

const App = {
  // App-wide configuration state
  state: {
    activeTheme: 'obsidian',
    soundEnabled: true,
    audioCtx: null
  },

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.initClock();
    this.loadSettings();
    this.initVectorField();
    this.initSubModules();
  },

  cacheDOM() {
    this.appNode = document.getElementById('app');
    this.navButtons = document.querySelectorAll('.nav-btn');
    this.panels = document.querySelectorAll('.dashboard-panel');
    this.dynamicTitle = document.getElementById('dynamic-title');
    this.dynamicSubtitle = document.getElementById('dynamic-subtitle');
    this.timeDisplay = document.getElementById('time-display');
    
    // Audio elements
    this.audioToggleBtn = document.getElementById('audio-toggle-btn');
    this.audioIconOn = document.getElementById('audio-icon-on');
    this.audioIconOff = document.getElementById('audio-icon-off');

    // Theme selector
    this.themeMenuBtn = document.getElementById('theme-menu-btn');
    this.themePopover = document.getElementById('theme-popover');
    this.themeOptions = document.querySelectorAll('.theme-opt');
  },

  bindEvents() {
    // Navigation routing
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = btn.dataset.target;
        this.switchPanel(target, btn);
        this.playBeep(600, 0.05, 0.02); // Short beep on route switch
      });
    });

    // Sound FX control
    this.audioToggleBtn.addEventListener('click', () => {
      this.toggleSound();
    });

    // Theme Popover toggle
    this.themeMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.themePopover.classList.toggle('show');
      this.playBeep(450, 0.04, 0.01);
    });

    // Dismiss popover on click outside
    document.addEventListener('click', () => {
      this.themePopover.classList.remove('show');
    });

    // Select theme
    this.themeOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        const selectedTheme = opt.dataset.theme;
        this.applyTheme(selectedTheme);
        this.playBeep(700, 0.08, 0.03);
      });
    });
  },

  initClock() {
    const updateClock = () => {
      const now = new Date();
      this.timeDisplay.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    updateClock();
    setInterval(updateClock, 1000);
  },

  switchPanel(targetPanelId, activeNavBtn) {
    // Toggle nav classes
    this.navButtons.forEach(btn => btn.classList.remove('active'));
    activeNavBtn.classList.add('active');

    // Toggle panels
    this.panels.forEach(panel => {
      if (panel.id === targetPanelId) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Update headers dynamically
    const headerInfo = {
      'calculator-panel': {
        title: 'Calculator',
        subtitle: 'Scientific calculator with history, constants and a function graph'
      },
      'converter-panel': {
        title: 'Unit Converter',
        subtitle: 'Convert length, mass, temperature, pressure, energy and more'
      },
      'bmi-panel': {
        title: 'BMI Calculator',
        subtitle: 'Body mass index and the healthy weight range for your height'
      },
      'currency-panel': {
        title: 'Currency Converter',
        subtitle: 'Convert between currencies using indicative exchange rates'
      },
      'formula-panel': {
        title: 'Formula Library',
        subtitle: 'Search a formula, press Calculate, and enter values to get the answer'
      },
      'calculus-panel': {
        title: 'Calculus',
        subtitle: 'Derivatives and integrals with the rule used, checked before they are shown'
      }
    };

    const info = headerInfo[targetPanelId];
    if (info) {
      this.dynamicTitle.textContent = info.title;
      this.dynamicSubtitle.textContent = info.subtitle;
    }
  },

  // Synthesizes a soft key-click sound
  playBeep(frequency = 600, duration = 0.05, decay = 0.02) {
    if (!this.state.soundEnabled) return;

    try {
      // Lazy init AudioContext on first interaction (required by browser security)
      if (!this.state.audioCtx) {
        this.state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume context if suspended
      if (this.state.audioCtx.state === 'suspended') {
        this.state.audioCtx.resume();
      }

      const osc = this.state.audioCtx.createOscillator();
      const gainNode = this.state.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, this.state.audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.04, this.state.audioCtx.currentTime); // keep it soft
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.state.audioCtx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.state.audioCtx.destination);

      osc.start();
      osc.stop(this.state.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context creation failed: ", e);
    }
  },

  toggleSound() {
    this.state.soundEnabled = !this.state.soundEnabled;
    localStorage.setItem('quantum_calc_sound', this.state.soundEnabled);
    this.updateSoundUI();
    if (this.state.soundEnabled) {
      this.playBeep(650, 0.08, 0.02);
    }
  },

  updateSoundUI() {
    if (this.state.soundEnabled) {
      this.audioIconOn.style.display = 'block';
      this.audioIconOff.style.display = 'none';
      this.audioToggleBtn.classList.remove('muted');
    } else {
      this.audioIconOn.style.display = 'none';
      this.audioIconOff.style.display = 'block';
      this.audioToggleBtn.classList.add('muted');
    }
  },

  applyTheme(themeName) {
    this.state.activeTheme = themeName;
    localStorage.setItem('quantum_calc_theme', themeName);
    
    // Clear theme attributes
    if (themeName === 'obsidian') {
      this.appNode.removeAttribute('data-theme');
      document.body.removeAttribute('data-theme');
    } else {
      this.appNode.setAttribute('data-theme', themeName);
      document.body.setAttribute('data-theme', themeName);
    }
    
    // Redraw graph if active
    if (window.ScientificCalculator && typeof window.ScientificCalculator.drawGraph === 'function') {
      window.ScientificCalculator.drawGraph();
    }
  },

  loadSettings() {
    // Theme loading
    const savedTheme = localStorage.getItem('quantum_calc_theme');
    if (savedTheme) {
      this.applyTheme(savedTheme);
    } else {
      this.applyTheme('obsidian');
    }

    // Sound settings loading
    const savedSound = localStorage.getItem('quantum_calc_sound');
    if (savedSound !== null) {
      this.state.soundEnabled = savedSound === 'true';
    } else {
      this.state.soundEnabled = true;
    }
    this.updateSoundUI();
  },

  initVectorField() {
    const canvas = document.getElementById('vector-field-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    class Particle {
      constructor() {
        this.reset();
      }
      
      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.speed = Math.random() * 0.6 + 0.15;
        this.life = Math.random() * 200 + 100;
        this.maxLife = this.life;
        this.alpha = 0;
      }
      
      update() {
        const angle = (Math.sin(this.y * 0.004) + Math.cos(this.x * 0.004)) * Math.PI;
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;
        
        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
          this.reset();
        }
        
        this.life--;
        if (this.life <= 0) {
          this.reset();
        }
        
        if (this.life > this.maxLife * 0.8) {
          this.alpha = (this.maxLife - this.life) / (this.maxLife * 0.2);
        } else if (this.life < this.maxLife * 0.2) {
          this.alpha = this.life / (this.maxLife * 0.2);
        } else {
          this.alpha = 1;
        }
      }
      
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.2, 0, Math.PI * 2);
        
        let theme = App.state.activeTheme;
        let color = '255, 176, 0'; // Retro Amber Phosphor
        if (theme === 'oscilloscope') color = '255, 176, 0';
        
        ctx.fillStyle = `rgba(${color}, ${this.alpha * 0.22})`;
        ctx.shadowColor = `rgb(${color})`;
        ctx.shadowBlur = 3;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    
    let particles = [];
    const particleCount = 50;
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
    
    let animationFrameId;
    const animate = () => {
      let theme = App.state.activeTheme;
      if (theme !== 'oscilloscope') {
        ctx.clearRect(0, 0, width, height);
        animationFrameId = requestAnimationFrame(animate);
        return;
      }
      
      ctx.fillStyle = 'rgba(3, 8, 5, 0.08)';
      ctx.fillRect(0, 0, width, height);
      
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
    
    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });
  },

  initSubModules() {
    // Call initializers of imported modules if any setup is needed
    if (window.ScientificCalculator) window.ScientificCalculator.init(this);
    if (window.UnitConverters) window.UnitConverters.init(this);
    if (window.UnitConverterUI) window.UnitConverterUI.init(this);
    if (window.BMICalculator) window.BMICalculator.init(this);
    if (window.FormulaLibrary) window.FormulaLibrary.init(this);
    if (window.CalculusTools) window.CalculusTools.init(this);
  }
};

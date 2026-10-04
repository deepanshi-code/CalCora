// --- BMI & HEALTH SUITE MODULE ---
window.BMICalculator = {
  state: {
    unitSystem: 'METRIC', // 'METRIC' or 'IMPERIAL'
    weightKg: 70,
    heightCm: 170,
    weightLb: 154,
    heightFt: 5,
    heightIn: 7
  },

  init(appInstance) {
    this.app = appInstance;
    this.cacheDOM();
    this.bindEvents();
    this.calculateBMI();
  },

  cacheDOM() {
    this.metricBtn = document.getElementById('bmi-metric-btn');
    this.imperialBtn = document.getElementById('bmi-imperial-btn');
    
    this.metricHeightRow = document.getElementById('bmi-metric-height-row');
    this.imperialHeightRow = document.getElementById('bmi-imperial-height-row');
    
    // Inputs
    this.inputCm = document.getElementById('bmi-cm');
    this.inputFt = document.getElementById('bmi-feet');
    this.inputIn = document.getElementById('bmi-inches');
    this.inputWeight = document.getElementById('bmi-weight');
    this.weightUnitLbl = document.getElementById('bmi-weight-unit-lbl');
    
    // Outputs
    this.scoreVal = document.getElementById('bmi-score-value');
    this.needle = document.getElementById('bmi-needle');
    this.badge = document.getElementById('bmi-category-badge');
    this.adviceRange = document.getElementById('bmi-range-advice');
    this.adviceDetail = document.getElementById('bmi-detail-advice');
  },

  bindEvents() {
    // Metric tab selection
    this.metricBtn.addEventListener('click', () => {
      this.app.playBeep(600, 0.05, 0.015);
      this.switchUnitSystem('METRIC');
    });

    // Imperial tab selection
    this.imperialBtn.addEventListener('click', () => {
      this.app.playBeep(600, 0.05, 0.015);
      this.switchUnitSystem('IMPERIAL');
    });

    // Input listeners to trigger recalculation on typing
    const allInputs = [this.inputCm, this.inputFt, this.inputIn, this.inputWeight];
    allInputs.forEach(input => {
      input.addEventListener('input', () => {
        this.app.playBeep(700, 0.02, 0.005);
        this.syncInputsToState();
        this.calculateBMI();
      });
    });
  },

  switchUnitSystem(system) {
    if (this.state.unitSystem === system) return;

    this.state.unitSystem = system;

    if (system === 'METRIC') {
      this.metricBtn.classList.add('active');
      this.imperialBtn.classList.remove('active');
      
      this.metricHeightRow.style.display = 'flex';
      this.imperialHeightRow.style.display = 'none';
      this.weightUnitLbl.textContent = 'kg';
      
      // Convert Imperial values in state to Metric for input display
      const totalInches = (this.state.heightFt * 12) + this.state.heightIn;
      this.state.heightCm = Math.round(totalInches * 2.54);
      this.state.weightKg = Math.round(this.state.weightLb * 0.45359237);
      
      this.inputCm.value = this.state.heightCm;
      this.inputWeight.value = this.state.weightKg;
      
    } else {
      this.metricBtn.classList.remove('active');
      this.imperialBtn.classList.add('active');
      
      this.metricHeightRow.style.display = 'none';
      this.imperialHeightRow.style.display = 'flex';
      this.weightUnitLbl.textContent = 'lb';
      
      // Convert Metric values in state to Imperial for input display
      const totalInches = this.state.heightCm / 2.54;
      this.state.heightFt = Math.floor(totalInches / 12);
      this.state.heightIn = Math.round(totalInches % 12);
      this.state.weightLb = Math.round(this.state.weightKg / 0.45359237);
      
      this.inputFt.value = this.state.heightFt;
      this.inputIn.value = this.state.heightIn;
      this.inputWeight.value = this.state.weightLb;
    }

    this.calculateBMI();
  },

  syncInputsToState() {
    if (this.state.unitSystem === 'METRIC') {
      this.state.heightCm = parseFloat(this.inputCm.value) || 0;
      this.state.weightKg = parseFloat(this.inputWeight.value) || 0;
    } else {
      this.state.heightFt = parseFloat(this.inputFt.value) || 0;
      this.state.heightIn = parseFloat(this.inputIn.value) || 0;
      this.state.weightLb = parseFloat(this.inputWeight.value) || 0;
    }
  },

  calculateBMI() {
    let bmi = 0;
    let heightM = 0;
    let heightInches = 0;

    if (this.state.unitSystem === 'METRIC') {
      heightM = this.state.heightCm / 100;
      if (heightM > 0 && this.state.weightKg > 0) {
        bmi = this.state.weightKg / (heightM * heightM);
      }
    } else {
      heightInches = (this.state.heightFt * 12) + this.state.heightIn;
      if (heightInches > 0 && this.state.weightLb > 0) {
        bmi = (this.state.weightLb * 703) / (heightInches * heightInches);
      }
    }

    this.updateUI(bmi, heightM, heightInches);
  },

  updateUI(bmi, heightM, heightInches) {
    // 1. Output score value
    const finalScore = bmi > 0 ? parseFloat(bmi.toFixed(1)) : 0;
    this.scoreVal.textContent = finalScore > 0 ? finalScore.toString() : '--';

    // 2. Animate gauge needle
    // Speedometer arc: -90deg is BMI 15 or less, +90deg is BMI 40 or more
    let angle = -90;
    if (finalScore > 0) {
      const minBmi = 15;
      const maxBmi = 40;
      const clampedBmi = Math.max(minBmi, Math.min(maxBmi, finalScore));
      const ratio = (clampedBmi - minBmi) / (maxBmi - minBmi);
      angle = -90 + (ratio * 180);
    }
    this.needle.style.transform = `rotate(${angle}deg)`;

    // 3. Category badge & advice card details
    this.badge.className = 'bmi-status-badge'; // reset
    let category = '';
    let categoryClass = '';
    let adviceText = '';

    if (finalScore === 0) {
      this.badge.textContent = 'No Input';
      this.badge.classList.add('bmi-status-normal');
      this.adviceRange.textContent = 'Enter your height and weight to see the healthy range';
      this.adviceDetail.textContent = 'Calculations are based on standard World Health Organization (WHO) BMI classifications.';
      return;
    }

    if (finalScore < 18.5) {
      category = 'Underweight';
      categoryClass = 'bmi-status-underweight';
      adviceText = 'Your BMI is in the underweight range. It is recommended to speak with a healthcare professional to identify if dietary modifications are needed. Focus on nutrient-dense meals and regular strength training.';
    } else if (finalScore >= 18.5 && finalScore < 25.0) {
      category = 'Normal Weight';
      categoryClass = 'bmi-status-normal';
      adviceText = 'Your BMI is in the healthy/normal range. This is optimal for cardiovascular, metabolic, and joint health. Continue a balanced diet rich in clean proteins, complex carbs, healthy fats, and keep active.';
    } else if (finalScore >= 25.0 && finalScore < 30.0) {
      category = 'Overweight';
      categoryClass = 'bmi-status-overweight';
      adviceText = 'Your BMI is in the overweight category. This might slightly increase risks of cardiovascular issues. Implementing minor calorie restrictions, reducing processed sugars, and stepping up cardio activities can be helpful.';
    } else {
      category = 'Obese';
      categoryClass = 'bmi-status-obese';
      adviceText = 'Your BMI corresponds to the obese threshold. This is linked to elevated health concerns like hypertension and diabetes. Consult a clinician or nutritionist for a structured fitness and weight reduction strategy.';
    }

    this.badge.textContent = category;
    this.badge.classList.add(categoryClass);
    this.adviceDetail.textContent = adviceText;

    // 4. Healthy Weight Range calculation
    if (this.state.unitSystem === 'METRIC') {
      const minWeight = 18.5 * (heightM * heightM);
      const maxWeight = 24.9 * (heightM * heightM);
      this.adviceRange.textContent = `Healthy weight range for your height: ${minWeight.toFixed(1)} kg - ${maxWeight.toFixed(1)} kg`;
    } else {
      const minWeight = (18.5 * (heightInches * heightInches)) / 703;
      const maxWeight = (24.9 * (heightInches * heightInches)) / 703;
      this.adviceRange.textContent = `Healthy weight range for your height: ${minWeight.toFixed(1)} lb - ${maxWeight.toFixed(1)} lb`;
    }
  }
};

// --- CURRENCY CONVERTER MODULE ---
// (Length, weight and every other physical unit live in units.js and unit-converter.js.)
window.UnitConverters = {
  // Offline fallback rates: rates for 1 INR in other currencies
  rates: {
    INR: 1,
    USD: 0.0120,  // ~83.33 INR/USD
    EUR: 0.0111,  // ~90.09 INR/EUR
    GBP: 0.0095,  // ~105.26 INR/GBP
    JPY: 1.8800,  // ~0.53 INR/JPY
    AUD: 0.0181,  // ~55.25 INR/AUD
    CAD: 0.0164,  // ~60.98 INR/CAD
    CHF: 0.0107,  // ~93.45 INR/CHF
    CNY: 0.0870,  // ~11.49 INR/CNY
    AED: 0.0440,  // ~22.73 INR/AED
    SAR: 0.0450   // ~22.22 INR/SAR
  },

  flags: {
    INR: '🇮🇳',
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    AUD: '🇦🇺',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    CNY: '🇨🇳',
    AED: '🇦🇪',
    SAR: '🇸🇦'
  },

  init(appInstance) {
    this.app = appInstance;
    this.cacheDOM();
    this.bindEvents();
    this.loadRatesFromStorage();
    this.syncLiveRates(); // Attempt sync immediately
    this.updateCurrencyConversion();
    this.updateRatesTable();
    this.showRatesAge();
  },

  cacheDOM() {
    // Currency elements
    this.srcCurrencySelect = document.getElementById('source-currency-select');
    this.tgtCurrencySelect = document.getElementById('target-currency-select');
    this.srcCurrencyInput = document.getElementById('source-currency-input');
    this.tgtCurrencyInput = document.getElementById('target-currency-input');
    
    this.srcCurrencyFlag = document.getElementById('source-currency-flag');
    this.tgtCurrencyFlag = document.getElementById('target-currency-flag');
    this.swapCurrencyBtn = document.getElementById('swap-currency-btn');
    
    this.refreshRatesBtn = document.getElementById('refresh-rates-btn');
    this.rateFormulaDisplay = document.getElementById('rate-formula-display');
  },

  bindEvents() {
    // --- 3. CURRENCY EVENTS ---
    this.srcCurrencyInput.addEventListener('input', () => {
      this.app.playBeep(720, 0.02, 0.005);
      this.updateCurrencyConversion();
    });

    this.srcCurrencySelect.addEventListener('change', () => {
      this.app.playBeep(600, 0.04, 0.015);
      this.updateFlags();
      this.updateCurrencyConversion();
    });

    this.tgtCurrencySelect.addEventListener('change', () => {
      this.app.playBeep(600, 0.04, 0.015);
      this.updateFlags();
      this.updateCurrencyConversion();
    });

    this.swapCurrencyBtn.addEventListener('click', () => {
      this.app.playBeep(650, 0.06, 0.02);
      
      // Swap selectors
      const tempSelect = this.srcCurrencySelect.value;
      this.srcCurrencySelect.value = this.tgtCurrencySelect.value;
      this.tgtCurrencySelect.value = tempSelect;
      
      // Swap input value (put target computed value back to source input)
      const tempVal = parseFloat(this.srcCurrencyInput.value);
      const computedVal = parseFloat(this.tgtCurrencyInput.value);
      if (!isNaN(computedVal)) {
        this.srcCurrencyInput.value = parseFloat(computedVal.toFixed(4));
      }
      
      this.updateFlags();
      this.updateCurrencyConversion();
    });

    this.refreshRatesBtn.addEventListener('click', () => {
      this.app.playBeep(500, 0.06, 0.025);
      this.syncLiveRates();
    });
  },

  clearGroup(elements) {
    elements.forEach(el => el.value = '');
  },

  updateFlags() {
    this.srcCurrencyFlag.textContent = this.flags[this.srcCurrencySelect.value] || '🌐';
    this.tgtCurrencyFlag.textContent = this.flags[this.tgtCurrencySelect.value] || '🌐';
  },

  updateCurrencyConversion() {
    const srcVal = parseFloat(this.srcCurrencyInput.value);
    if (isNaN(srcVal) || srcVal < 0) {
      this.tgtCurrencyInput.value = '0';
      return;
    }

    const srcCode = this.srcCurrencySelect.value;
    const tgtCode = this.tgtCurrencySelect.value;

    // Convert: source currency -> INR -> target currency
    // Since rates are mapped relative to INR (1 INR = rates[code] units)
    const valInINR = srcVal / this.rates[srcCode];
    const convertedVal = valInINR * this.rates[tgtCode];

    this.tgtCurrencyInput.value = parseFloat(convertedVal.toFixed(4));
    
    // Formula label: "1 USD = 83.45 INR" (or opposite direction if swapped)
    // Formula shows relationship between the two selected currencies
    const relationship = 1 / this.rates[srcCode] * this.rates[tgtCode];
    this.rateFormulaDisplay.textContent = `1 ${srcCode} = ${parseFloat(relationship.toFixed(5))} ${tgtCode}`;
  },

  updateRatesTable() {
    // Fill the rates table: 1 unit of foreign currency = X INR
    Object.keys(this.rates).forEach(code => {
      if (code === 'INR') return;
      const element = document.getElementById(`rate-${code.toLowerCase()}`);
      if (element) {
        // Since rates are: 1 INR = rates[code] Foreign. So 1 Foreign = (1 / rates[code]) INR
        const rateAgainstINR = 1 / this.rates[code];
        element.textContent = `₹${rateAgainstINR.toFixed(2)}`;
      }
    });
  },

  async syncLiveRates() {
    this.refreshRatesBtn.classList.add('spinning');
    this.refreshRatesBtn.disabled = true;

    try {
      // open.er-api.com returns rates relative to base currency INR
      const response = await fetch('https://open.er-api.com/v6/latest/INR');
      if (!response.ok) throw new Error("API sync error");
      const data = await response.json();
      
      if (data && data.rates) {
        // Safely extract currencies we support
        const codes = Object.keys(this.rates);
        codes.forEach(code => {
          if (data.rates[code]) {
            this.rates[code] = data.rates[code];
          }
        });
        
        localStorage.setItem('quantum_calc_rates', JSON.stringify(this.rates));
        localStorage.setItem('quantum_calc_rates_timestamp', Date.now());
        
        this.updateCurrencyConversion();
        this.updateRatesTable();
        this.showRatesAge();
        this.showSyncStatus(true);
      }
    } catch (e) {
      console.warn("Unable to fetch live currency rates, using cached/offline fallback rates", e);
      this.showSyncStatus(false);
    } finally {
      this.refreshRatesBtn.classList.remove('spinning');
      this.refreshRatesBtn.disabled = false;
    }
  },

  // Tells the user how fresh the numbers are; indicative rates must never look authoritative.
  showRatesAge() {
    const el = document.getElementById('rates-updated');
    if (!el) return;
    const ts = Number(localStorage.getItem('quantum_calc_rates_timestamp'));
    el.textContent = ts
      ? `Rates last synced ${new Date(ts).toLocaleString()} (indicative, not for trading)`
      : 'Approximate offline rates (not synced)';
  },

  showSyncStatus(isSuccess) {
    const originalText = this.refreshRatesBtn.querySelector('span').textContent;
    const indicator = this.refreshRatesBtn.querySelector('span');
    
    if (isSuccess) {
      indicator.textContent = 'Synced!';
      this.refreshRatesBtn.style.color = 'var(--accent-success)';
    } else {
      indicator.textContent = 'Offline Fallback';
      this.refreshRatesBtn.style.color = 'var(--accent-danger)';
    }

    setTimeout(() => {
      indicator.textContent = 'Sync live rates';
      this.refreshRatesBtn.style.color = '';
    }, 2000);
  },

  loadRatesFromStorage() {
    const savedRates = localStorage.getItem('quantum_calc_rates');
    if (savedRates) {
      try {
        this.rates = JSON.parse(savedRates);
      } catch (e) {
        console.warn("Unable to parse stored exchange rates");
      }
    }
  }
};

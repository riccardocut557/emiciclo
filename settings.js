/**
 * settings.js
 * Handles saving and loading user UI settings via Supabase
 */

const SettingsManager = {
    // List of checkbox IDs to save/load
    toggles: [
        'show-parabola',
        'show-projections',
        'use-momentum-rule',
        'priority-24-bars',
        'use-rsi-stoch',
        'bot-fees',
        'bot-opp-close',
        'bot-ma-trend',
        'bot-max-loss',
        'bot-multi-trade',
        'bot-vol-filter',
        'bot-trailing',
        'bot-dyn-exit'
    ],

    // List of input IDs to save/load
    inputs: [
        'custom-min',
        'custom-max',
        'cycle-precision',
        'bot-balance',
        'bot-leverage',
        'bot-capital',
        'bot-tp1-pct',
        'bot-tp1-close',
        'bot-tp2-pct',
        'bot-max-loss-pct',
        'bot-vol-factor',
        'bot-trail-act',
        'bot-trail-callback',
        'bot-dyn-sl-mult',
        'bot-dyn-tp-mult'
    ],

    // Selector IDs
    selectors: [
        'crypto-select'
    ],

    /**
     * Gather current UI state into a settings object
     */
    gatherUISettings() {
        const settings = {};

        // Save Toggles
        this.toggles.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.checked;
        });

        // Save Inputs
        this.inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.value;
        });

        // Save Selectors
        this.selectors.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.value;
        });

        // Specialized logic for timeframe buttons if needed
        // (currently main.js handles this via click, might need extra logic to restore active class)
        const activeTf = document.querySelector('.tf-btn.active');
        if (activeTf) settings['active-timeframe'] = activeTf.dataset.timeframe;

        return settings;
    },

    /**
     * Apply settings object to UI
     */
    applyUISettings(settings) {
        if (!settings) return;

        console.log("Applying user settings:", settings);

        // Restore Toggles
        this.toggles.forEach(id => {
            if (settings[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) {
                    el.checked = settings[id];
                    // Trigger change event if needed for listeners
                    el.dispatchEvent(new Event('change'));
                }
            }
        });

        // Restore Inputs
        this.inputs.forEach(id => {
            if (settings[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) {
                    el.value = settings[id];
                    el.dispatchEvent(new Event('change'));
                    el.dispatchEvent(new Event('input')); // some listeners might use input
                }
            }
        });

        // Restore Selectors
        this.selectors.forEach(id => {
            if (settings[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) {
                    el.value = settings[id];
                    el.dispatchEvent(new Event('change'));
                }
            }
        });

        // Restore Timeframe
        if (settings['active-timeframe']) {
            const tfBtn = document.querySelector(`.tf-btn[data-timeframe="${settings['active-timeframe']}"]`);
            if (tfBtn) {
                tfBtn.click(); // This will trigger the main.js logic to switch timeframe
            }
        }
    },

    /**
     * Save current settings to Supabase
     */
    async saveSettings() {
        try {
            const user = await window.auth.getUser();
            if (!user) {
                alert("You must be logged in to save settings.");
                return;
            }

            const currentSettings = this.gatherUISettings();

            const { error } = await window.supabaseClient
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    settings: currentSettings,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            this.showToast("✅ Settings saved successfully!");

        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Failed to save settings: " + error.message);
        }
    },

    /**
     * Load settings from Supabase
     */
    async loadSettings() {
        try {
            const user = await window.auth.getUser();
            if (!user) return; // Not logged in, skip

            const { data, error } = await window.supabaseClient
                .from('user_settings')
                .select('settings')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') { // Ignore "no rows found" error
                throw error;
            }

            if (data && data.settings) {
                this.applyUISettings(data.settings);
                this.showToast("🚀 User settings loaded");
            }

        } catch (error) {
            console.error("Error loading settings:", error);
        }
    },

    /**
     * Helper to show a small toast message
     */
    showToast(message) {
        let toast = document.getElementById('settings-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'settings-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(16, 185, 129, 0.9);
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                z-index: 1000;
                font-family: 'Inter', sans-serif;
                font-size: 0.9rem;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
        }, 3000);
    }
};

window.SettingsManager = SettingsManager;

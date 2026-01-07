/*
 * Chatooly UI Controls
 * Author: Yael Renous - Studio Video
 *
 * This file handles UI-specific functionality like collapsible sections,
 * control visibility toggles, and other interface interactions.
 *
 * AI AGENTS: Put UI control logic here, NOT in main.js
 * - Collapsible sections
 * - Show/hide control groups
 * - Button interactions that don't affect canvas
 * - Form validation and UI state management
 */

// Setup collapsible sections and UI behaviors
document.addEventListener('DOMContentLoaded', () => {
    // Setup collapsible section cards
    document.querySelectorAll('.chatooly-section-header').forEach(header => {
        header.addEventListener('click', function() {
            const card = this.closest('.chatooly-section-card');
            if (card) {
                card.classList.toggle('collapsed');
                const isExpanded = !card.classList.contains('collapsed');
                this.setAttribute('aria-expanded', isExpanded);
            }
        });

        // Set initial aria-expanded state
        const card = header.closest('.chatooly-section-card');
        if (card) {
            const isExpanded = !card.classList.contains('collapsed');
            header.setAttribute('aria-expanded', isExpanded);
        }
    });

    // Toggle switch functionality
    document.querySelectorAll('.chatooly-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const isPressed = this.getAttribute('aria-pressed') === 'true';
            this.setAttribute('aria-pressed', !isPressed);

            // Dispatch a custom event for the main.js to listen to
            const event = new CustomEvent('toggle-change', {
                detail: {
                    id: this.id,
                    checked: !isPressed
                },
                bubbles: true
            });
            this.dispatchEvent(event);
        });
    });

    // Interactive slider value updates
    document.querySelectorAll('.chatooly-slider').forEach(slider => {
        const sliderGroup = slider.closest('.chatooly-slider-group');
        if (sliderGroup) {
            const valueSpan = sliderGroup.querySelector('.chatooly-slider-value');
            if (valueSpan) {
                slider.addEventListener('input', (e) => {
                    const step = parseFloat(slider.getAttribute('step')) || 1;
                    if (step < 1) {
                        valueSpan.textContent = parseFloat(e.target.value).toFixed(1);
                    } else {
                        valueSpan.textContent = e.target.value;
                    }
                });
            }
        }
    });
});

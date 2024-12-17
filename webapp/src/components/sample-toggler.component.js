// @ts-check

class SampleTogglerHTMLElement extends HTMLElement {
    
    /**
   *  @type {ShadowRoot | null} 
   */
    shadowRoot = null;

    /**
   *  @type {HTMLInputElement | null} 
   */
    inputHTMLElement = null;

    /**
   *  @type {boolean} 
   */
    _state = false;

    /**
   *  @type {boolean} 
   */
    get state() {
        return this._state;
    }

    /**
   * @param {boolean} value
   */
    set state(value) {
        if( this.inputHTMLElement === null) {
            return;
        }
        this._state = Boolean(value) || false;
        this.inputHTMLElement.checked = this._state;
    }


    connectedCallback() {
        if (this.inputHTMLElement) {
            this.inputHTMLElement.addEventListener('input', this._onInputListenerOnCurrentContext);
        }
    }

    disconnectedCallback() {
        if (this.inputHTMLElement) {
            this.inputHTMLElement.removeEventListener('input', this._onInputListenerOnCurrentContext);
        }
    }

    /**
     * 
     * @param {Event} event 
     */
    _onInputListenerOnCurrentContext = (event) => {
        this._onInputListener(event);
    }


    /**
   * @param {Event} event
   */
    _onInputListener(event) {
        /** @type {HTMLInputElement} */
        const target = /** @type {HTMLInputElement} */ (event.target);
        this.state = target.checked;
        this.dispatchEvent(
            new CustomEvent('toggle', { 
                detail: { 
                    state: this.state 
                },
                bubbles: true, // Allow the event to bubble up
                composed: true, // Allow it to cross shadow DOM boundaries
            })
        );
    }


    constructor() {
        super();


        this.shadowRoot = this.attachShadow({ mode: 'open' });

        const togglerWrapper = document.createElement('div');
        togglerWrapper.className = "property-slider-wrapper";
        const togglerWrapperCheckbox = document.createElement('div');
        togglerWrapperCheckbox.className = "sample-toggler-checkbox";

        const togglerLabel = document.createElement('label');
        togglerLabel.innerText = `Activate sample`;

        this.inputHTMLElement = document.createElement('input');
        this.inputHTMLElement.type = 'checkbox';

        togglerWrapperCheckbox.appendChild(this.inputHTMLElement);
        togglerWrapper.appendChild(togglerLabel);
        togglerWrapper.appendChild(togglerWrapperCheckbox);

        const style = document.createElement('style');
        style.textContent = `
            .property-slider-wrapper {
                display: flex;
            }
            .property-slider-wrapper label, 
            .property-slider-wrapper .sample-toggler-checkbox {
                width: 50%;
            }
        `;

        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(togglerWrapper);

    }
}

customElements.define('sample-toggler', SampleTogglerHTMLElement);
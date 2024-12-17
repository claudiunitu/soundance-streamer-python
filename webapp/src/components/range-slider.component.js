// @ts-check


class RangeSliderHTMLElement extends HTMLElement {
    
    /**
   *  @type {ShadowRoot | null} 
   */
    shadowRoot = null;

    /**
   *  @type {HTMLDivElement | null} 
   */
    outerWrapperHTMLElement = null;

    /**
   *  @type {HTMLDivElement | null} 
   */
    inputWrapperHTMLElement = null;

    /**
   *  @type {HTMLInputElement | null} 
   */
    inputHTMLElement = null;

    /**
   *  @type {HTMLLabelElement | null} 
   */
    labelHTMLElement = null;

    /**
   *  @type {HTMLDivElement | null} 
   */
    scaleUnitLabelsWrapperHTMLElement = null;

    /**
   *  @type {string} 
   */
    _label = 'Label not set';

    /**
   *  @type {string} 
   */
    _scaleUnitLabel = '';

    /**
   *  @type {number} 
   */
    _value = 0;

    /**
   *  @type {number} 
   */
    _min = 0;

    /**
   *  @type {number} 
   */
    _max = 0;

    /**
   *  @type {string} 
   */
    get label() {
        return this._label;
    }

    /**
   * @param {string} label
   */
    set label(label) {
        this._label = label;
        if(!this.labelHTMLElement){
            return;
        }
        this.labelHTMLElement.textContent = label;

    }

    /**
   *  @type {string} 
   */
    get scaleUnitLabel() {
        return this._scaleUnitLabel;
    }

    /**
   * @param {string} scaleUnitLabel
   */
    set scaleUnitLabel(scaleUnitLabel) {
        this._scaleUnitLabel = scaleUnitLabel;
        this.renderScaleLabels();
    }

    /**
   *  @type {number} 
   */
    get value() {
        return Number(this._value);
    }

    /**
   * @param {number | string} value
   */
    set value(value) {
        this._value = Number(value) || 0;
        if(!this.inputHTMLElement){
            return;
        }
        this.inputHTMLElement.value = this._value.toString();
        this.renderScaleLabels()
    }

    /**
   *  @type {number} 
   */
    get min() {
        return Number(this._min);
    }

    /**
   * @param {number | string} min
   */
    set min(min) {
        this._min = Number(min) || 0;
        if(!this.inputHTMLElement){
            return;
        }
        this.inputHTMLElement.min = this._min.toString();
        this.renderScaleLabels();
    }

    /**
   *  @type {number} 
   */
    get max() {
        return Number(this._max);
    }

    /**
   * @param {number | string} max
   */
    set max(max) {
        this._max = Number(max) || 0;
        if(!this.inputHTMLElement){
            return;
        }
        this.inputHTMLElement.max = this._max.toString();
        this.renderScaleLabels();
    }

    /**
   *  @type {number} 
   */
    _step = 1;
    /**
   *  @type {number} 
   */
    get step() {
        return Number(this._step);
    }

    /**
   * @param {number | string} step
   */
    set step(step) {
        this._step = Number(step) || 1;
        if(!this.inputHTMLElement){
            return;
        }
        this.inputHTMLElement.step = this.step.toString();
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

    _onInputListenerOnCurrentContext = (event) => {
        this._onInputListener(event);
    }

    /**
   * @param {InputEvent} event
   */
    _onInputListener(event) {
        /** @type {HTMLInputElement} */
        const target = /** @type {HTMLInputElement} */ (event.target);
        this.value = target.value;
        this.dispatchValueChange(this.value);
    }
    /**
     * 
     * @param {number} value 
     */
    dispatchValueChange(value){
        this.dispatchEvent(
            new CustomEvent('valueChange', { 
                detail: { 
                    volumeValue: value
                },
                bubbles: true, // Allow the event to bubble up
                composed: true, // Allow it to cross shadow DOM boundaries
            })
        );
    }

    renderScaleLabels() {
        if(this.scaleUnitLabelsWrapperHTMLElement){
            this.scaleUnitLabelsWrapperHTMLElement.innerHTML = `
                <label><small>${Math.floor(this.min)}${this.scaleUnitLabel}</small></label>
                <label><small>${this.value}</small></label>
                <label><small>${Math.floor(this.max)}${this.scaleUnitLabel}</small></label>
            `;
        }
    }

    constructor() {
        super();


        this.shadowRoot = this.attachShadow({ mode: 'open' });

        this.shadowRoot.innerHTML = '';

        this.outerWrapperHTMLElement = document.createElement('div');
        this.outerWrapperHTMLElement.setAttribute('class', 'property-slider-wrapper');

        this.labelHTMLElement = document.createElement('label');
        this.labelHTMLElement.textContent = this._label;

        this.inputHTMLElement = document.createElement('input');

        this.inputHTMLElement.type = "range";

        this.inputHTMLElement.step = this.step.toString();

        this.inputWrapperHTMLElement = document.createElement('div');
        this.inputWrapperHTMLElement.classList.add('input-wrapper')
        this.inputWrapperHTMLElement.appendChild(this.inputHTMLElement);

        // Generate the range unit labels
        this.scaleUnitLabelsWrapperHTMLElement = document.createElement('div');
        this.scaleUnitLabelsWrapperHTMLElement.classList.add('scale-units');
        this.scaleUnitLabelsWrapperHTMLElement.innerHTML = `
            <label><small>${Math.floor(this.min)}${this.scaleUnitLabel}</small></label>
            <label><small>${Math.floor(this.max)}${this.scaleUnitLabel}</small></label>
        `;
        this.inputWrapperHTMLElement.appendChild(this.scaleUnitLabelsWrapperHTMLElement);
        
        // this.inputHTMLElement.min = "0";
        // this.inputHTMLElement.max = "100";
        // this.inputHTMLElement.value = this.value;

        this.outerWrapperHTMLElement.appendChild(this.labelHTMLElement);
        this.outerWrapperHTMLElement.appendChild(this.inputWrapperHTMLElement);

        const style = document.createElement('style');
        style.textContent = `
            .property-slider-wrapper {
                display: flex;
                align-items: center;
            }
            .property-slider-wrapper label, 
            .property-slider-wrapper .input-wrapper {
                width: 50%;
            }
            .property-slider-wrapper .input-wrapper > input,
            .property-slider-wrapper .input-wrapper > .scale-units{
                width: 100%;
            }
            .property-slider-wrapper .input-wrapper > .scale-units{
                display: flex;
            }
            .property-slider-wrapper .input-wrapper > .scale-units > label {
                font-size: 80%;
            }
            .property-slider-wrapper .input-wrapper > .scale-units > label:first-child{
                text-align: left;
            }
            .property-slider-wrapper .input-wrapper > .scale-units > label:nth-child(2){
                text-align: center;
            }
            .property-slider-wrapper .input-wrapper > .scale-units > label:last-child{
                text-align: right;
            }
            .scale-units {
                display: flex;
            }
            .scale-units label{
                width: 33.33%;
            }
        `;

        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this.outerWrapperHTMLElement);

    }
}

customElements.define('range-slider', RangeSliderHTMLElement);
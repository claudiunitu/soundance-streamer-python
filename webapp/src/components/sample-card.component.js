// @ts-check

import './range-slider.component.js';
import './sample-toggler.component.js';

class SampleCardHTMLElement extends HTMLElement {
    
    /**
   *  @type {ShadowRoot | null} 
   */
    shadowRoot = null;

    /**
     * @type {import("script").LoadedSceneSamplesAudioData | null} 
     */
    loadedSceneSampleAudioData = null;

    /**
     * @type {number | null}
     */
    selectedSubsceneIndex = null;

    /**
     * @type {number | null}
     */
    selectedSubsceneWindowIndex = null;

    /**
     * @type {AudioContext | null}
     */
    audioContext = null;

    constructor() {
        super();


        this.shadowRoot = this.attachShadow({ mode: 'open' });


        const style = document.createElement('style');
        style.textContent = `
            .sample{
                padding: 10px;
                margin-bottom: 10px;
                background-color: rgb(233, 233, 233);
            }
            .sample.active{
                background-color: rgb(200, 255, 200);
            }

            .sample > * {
                margin-bottom: 5px;
                display: block;
            }
            .sample-fields-groul-label {
                text-align: center;
            }
            
        `;

        this.shadowRoot.appendChild(style);

        this.cardWrapperHTMLElement = document.createElement('div');
        this.shadowRoot.appendChild(this.cardWrapperHTMLElement);

    }

    refreshUI(){
        this.cardWrapperHTMLElement.innerHTML = '';
        this.cardWrapperHTMLElement.appendChild(this.createUIForSample(
            this.loadedSceneSampleAudioData,
            this.selectedSubsceneIndex,
            this.selectedSubsceneWindowIndex
        ))

    }

    async loadSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error(`Failed to load sound file at ${url}:`, error);
            return null; // Return null to prevent errors from breaking the whole program
        }
    }

    /**
     * 
     * @param {import("script").LoadedSceneSamplesAudioData} scenerySampleAudioData 
     * @returns 
     */
    playRandomVariation(scenerySampleAudioData) {

        const numberOfVariations = scenerySampleAudioData.sampleVariationsAudioData.length;
        const randomIndex = Math.floor(Math.random() * numberOfVariations);

        const audioBuffer = scenerySampleAudioData.sampleVariationsAudioData[randomIndex].audioBuffer;
        const gainNode = scenerySampleAudioData.sampleVariationsAudioData[randomIndex].gainNode;


        const audioBufferSource = this.audioContext.createBufferSource();
        audioBufferSource.buffer = audioBuffer;
        audioBufferSource.connect(gainNode).connect(this.audioContext.destination);

        // Store the buffer source for later stopping
        scenerySampleAudioData.currentSource = audioBufferSource;

        if (scenerySampleAudioData.stitchingMethod === "JOIN_WITH_CROSSFADE") {

            // this will only start immediately after one sample ended and does not really create a crossfade
            audioBufferSource.onended = () => {
                this.playRandomVariation(scenerySampleAudioData);
            };

        } else if (scenerySampleAudioData.stitchingMethod === "JOIN_WITH_OVERLAY") {

            if (audioBuffer === null) {
                return;
            }
            // Schedule the next variation to start before the current one ends
            let nextStartTime = audioBuffer.duration * 1000 - scenerySampleAudioData.concatOverlayMs; // mark*

            if (nextStartTime <= 0) {
                console.warn(`
                    The overlay duration must be higher than the sample duration.\n
                    Will play the next variation after the current one ends:\n
                    ${scenerySampleAudioData.sampleVariationsAudioData[randomIndex].variationFilePath}
                `);
                nextStartTime = audioBuffer.duration;
            }
            // Set a timeout to start the next variation before the current one ends
            scenerySampleAudioData.overlayTimeout = setTimeout(() => {
                this.playRandomVariation(scenerySampleAudioData);
            }, nextStartTime);

        }

        audioBufferSource.start();
    }

    /**
     * @param {import("script").LoadedSceneSamplesAudioData} sceneSamplesAudio 
     */
    stopSceneSampleVariations(sceneSamplesAudio) {

        if (sceneSamplesAudio.overlayTimeout) {

            clearTimeout(sceneSamplesAudio.overlayTimeout)
        }
        const currentSource = sceneSamplesAudio.currentSource;
        if (currentSource) {
            currentSource.stop();  // Stop the audio
            sceneSamplesAudio.currentSource = null;  // Clear the reference
        }
    }

    /**
     * 
     * @param {import("script").LoadedSceneSamplesAudioData} loadedSceneSampleAudioData 
     * @param {number} _selectedSubsceneIndex 
     * @param {number} _selectedSubsceneWindowIndex
     * 
     * @returns {HTMLDivElement}
     */
    createUIForSample(loadedSceneSampleAudioData, _selectedSubsceneIndex, _selectedSubsceneWindowIndex) {

        

        const { sampleVariationsAudioData, sampleSubsceneConfigParams } = loadedSceneSampleAudioData
    
        const currentSubsceneParams = sampleSubsceneConfigParams[_selectedSubsceneIndex].params;
    
        let currentSceneSampleVol = 0;
        if (typeof currentSubsceneParams?.currentVol === "number") {
            currentSceneSampleVol = currentSubsceneParams.currentVol;
        } else if (typeof currentSubsceneParams?.minVol === "number" && typeof currentSubsceneParams.maxVol === "number") {
            currentSceneSampleVol = Math.floor((currentSubsceneParams.minVol + currentSubsceneParams.maxVol) / 2);
        }
    
        // const groupHTMLParent = document.createElement('div');
    
        const sampleContainer = document.createElement('div');
        sampleContainer.classList.add("sample")
    
        // add label to controls group
        const labelElement = document.createElement('label');
        labelElement.classList.add('sample-fields-groul-label');
        labelElement.innerText = loadedSceneSampleAudioData.sampleLabel;
        sampleContainer.appendChild(labelElement);
    
    
        // const forCurrentSampleIndex = 0;
    
        // setup sample toggler
        /**
         * @type {SampleTogglerHTMLElement}
         */
        const sampleTogglerElement = /** @type {SampleTogglerHTMLElement} */ (document.createElement('sample-toggler'));
        sampleTogglerElement.addEventListener('toggle', async (event) => {
            /** @type {SampleTogglerHTMLElement} */
            const target = /** @type {SampleTogglerHTMLElement} */ (event.target);
            if (target.state === true) {
                let wasLoadedAndNotPlayed = false;
                for (let k = 0; k < sampleVariationsAudioData.length; k++) {
                    const sampleVariationAudioData = sampleVariationsAudioData[k];
                    if (sampleVariationAudioData.audioBuffer === null && sampleVariationAudioData.isAudioBufferLoading === false) {
                        sampleVariationAudioData.isAudioBufferLoading = true;
                        sampleVariationAudioData.audioBuffer = await this.loadSound(sampleVariationAudioData.variationFilePath).catch(e => { throw e });
                        sampleVariationAudioData.isAudioBufferLoading = false;
                        if (k === sampleVariationsAudioData.length - 1) {
                            // all variations loaded
                            wasLoadedAndNotPlayed = true;
                        }
                    }
                }
                sampleContainer.classList.add("active");
    
                if (volElement.value === 0) {
                    if (minVolElement.value > 0) {
                        volElement.value = minVolElement.value;
                    } else {
                        volElement.value = 50;
                    }
                }
                volElement.dispatchEvent(new Event('valueChange'));
    
    
                if (wasLoadedAndNotPlayed) {
                    wasLoadedAndNotPlayed = false;
                    try {
                        this.playRandomVariation(loadedSceneSampleAudioData);
                    } catch (e) {
                        console.error(e);
                    }
    
                }
            } else {
                sampleContainer.classList.remove("active");
                maxVolElement.value = 0;
                maxVolElement.dispatchEvent(new Event('valueChange'));
    
                this.stopSceneSampleVariations(loadedSceneSampleAudioData);
                for (let k = 0; k < sampleVariationsAudioData.length; k++) {
                    const sampleVariationAudioData = sampleVariationsAudioData[k];
                    if (sampleVariationAudioData.audioBuffer !== null) {
                        sampleVariationAudioData.audioBuffer = null;
                    }
                }
            }
        });
        sampleContainer.appendChild(sampleTogglerElement);
    
    
    
        // setup volume slider
        /**
         *  @type {RangeSliderHTMLElement} 
         */
        const volElement = /** @type {RangeSliderHTMLElement} */(document.createElement('range-slider'));
    
        volElement.addEventListener('valueChange', async (event) => {
            /** @type {RangeSliderHTMLElement} */
            const target = /** @type {RangeSliderHTMLElement} */ (event.target);
            const value = target.value;
    
            if (maxVolElement && value > maxVolElement.value) {
                maxVolElement.value = target.value;
                maxVolElement.dispatchEvent(new Event('valueChange'));
            }
    
            if (minVolElement && value < minVolElement.value) {
                minVolElement.value = target.value;
                minVolElement.dispatchEvent(new Event('valueChange'));
            }
    
            for (let j = 0; j < sampleVariationsAudioData.length; j++) {
                // we don't know which variation is playing so we should set the vorlume to all of them
                sampleVariationsAudioData[j].gainNode.gain.setValueAtTime(target.value / 100, this.audioContext.currentTime);
            }
    
            // persist value in state
            if (currentSubsceneParams) {
                currentSubsceneParams.currentVol = target.value;
            }
    
        });
    
        volElement.label = 'Volume';
        volElement.value = currentSceneSampleVol;
        volElement.min = 0;
        volElement.max = 100;
        volElement.scaleUnitLabel = '%';
    
        // volElement.dispatchEvent(new CustomEvent('valueChange'));
    
        sampleContainer.appendChild(volElement);
    
    
        // setup volume min slider
        /**
         *  @type {RangeSliderHTMLElement} 
         */
        const minVolElement = /** @type {RangeSliderHTMLElement} */ (document.createElement('range-slider'));
    
        minVolElement.addEventListener('valueChange', (event) => {
    
            /** @type {RangeSliderHTMLElement} */
            const target = /** @type {RangeSliderHTMLElement} */ (event.target);
    
            if (volElement && target.value > volElement.value) {
                volElement.value = target.value;
                volElement.dispatchEvent(new Event('valueChange'));
            }
    
            // persist value in state
            if (currentSubsceneParams) {
                currentSubsceneParams.minVol = target.value;
            }
    
        });
        minVolElement.label = 'Volume Min';
        minVolElement.min = 0;
        minVolElement.max = 100;
        minVolElement.scaleUnitLabel = '%';
        minVolElement.value = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? sampleSubsceneConfigParams[_selectedSubsceneIndex].params.minVol : 0;
    
    
        sampleContainer.appendChild(minVolElement);
    
    
        // setup volume max slider
        /**
         *  @type {RangeSliderHTMLElement} 
         */
        const maxVolElement = /** @type {RangeSliderHTMLElement} */ (document.createElement('range-slider'));
    
        maxVolElement.addEventListener('valueChange', (event) => {
    
            /** @type {RangeSliderHTMLElement} */
            const target = /** @type {RangeSliderHTMLElement} */ (event.target);
    
            if (target.value > 0 && sampleTogglerElement.state == false) {
                sampleTogglerElement.state = true;
                sampleTogglerElement.dispatchEvent(new Event('toggle'));
            } else if (target.value <= 0 && sampleTogglerElement.state == true) {
                sampleTogglerElement.state = false;
                sampleTogglerElement.dispatchEvent(new Event('toggle'));
            }
    
            if (volElement && target.value < volElement.value) {
                volElement.value = target.value;
                volElement.dispatchEvent(new Event('valueChange'));
            }
    
            // persist value in state
            if (currentSubsceneParams) {
                currentSubsceneParams.maxVol = target.value
            }
    
        });
    
        maxVolElement.label = 'Volume Max';
        maxVolElement.min = 0;
        maxVolElement.max = 100;
        maxVolElement.scaleUnitLabel = '%';
        maxVolElement.value = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? sampleSubsceneConfigParams[_selectedSubsceneIndex].params.maxVol : 0;
    
        sampleContainer.appendChild(maxVolElement);
    
    
        // setup variational timeframe min slider
        /**
         *  @type {RangeSliderHTMLElement} 
         */
        const minTimeframeElement =  /**@type {RangeSliderHTMLElement} */ (document.createElement('range-slider'));
    
        minTimeframeElement.addEventListener('valueChange', (event) => {
    
            /** @type {RangeSliderHTMLElement} */
            const target = /** @type {RangeSliderHTMLElement} */ (event.target);
    
            const limitingValue = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? Math.floor(sampleSubsceneConfigParams[_selectedSubsceneIndex].params.maxTimeframeLength / 1000) - 2 : 120;
            if (target.value >= limitingValue) {
                if (sampleSubsceneConfigParams[_selectedSubsceneIndex].params) {
                    sampleSubsceneConfigParams[_selectedSubsceneIndex].params.minTimeframeLength = limitingValue * 1000;
                }
                target.value = limitingValue;
            } else {
                if (sampleSubsceneConfigParams[_selectedSubsceneIndex].params) {
                    sampleSubsceneConfigParams[_selectedSubsceneIndex].params.minTimeframeLength = target.value * 1000;
                }
            }
    
            // persist value in state
            if (currentSubsceneParams) {
                currentSubsceneParams.minTimeframeLength = target.value * 1000
            }
    
        });
    
        minTimeframeElement.label = 'Timeframe Min';
        minTimeframeElement.min = 2;
        minTimeframeElement.max = 60 * 60;
        minTimeframeElement.scaleUnitLabel = 's';
        minTimeframeElement.step = 10;
        minTimeframeElement.value = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? Math.floor(sampleSubsceneConfigParams[_selectedSubsceneIndex].params.minTimeframeLength / 1000) : 60;
    
        sampleContainer.appendChild(minTimeframeElement);
    
    
        // setup variational timeframe max slider
        /**
         *  @type {RangeSliderHTMLElement} 
         */
        const maxTimeframeElement = /**@type {RangeSliderHTMLElement} */ (document.createElement('range-slider'));
    
        maxTimeframeElement.addEventListener('valueChange', (event) => {
            /** @type {RangeSliderHTMLElement} */
            const target = /** @type {RangeSliderHTMLElement} */ (event.target);
    
            const limitingValue = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? Math.floor(sampleSubsceneConfigParams[_selectedSubsceneIndex].params.minTimeframeLength / 1000) + 2 : 60;
            if (target.value <= limitingValue) {
                if (sampleSubsceneConfigParams[_selectedSubsceneIndex].params) {
                    sampleSubsceneConfigParams[_selectedSubsceneIndex].params.maxTimeframeLength = limitingValue * 1000;
                }
                target.value = limitingValue;
            } else {
                if (sampleSubsceneConfigParams[_selectedSubsceneIndex].params) {
                    sampleSubsceneConfigParams[_selectedSubsceneIndex].params.maxTimeframeLength = target.value * 1000;
                }
            }
    
            // persist value in state
            if (currentSubsceneParams) {
                currentSubsceneParams.maxTimeframeLength = target.value * 1000
            }
    
        });
    
        maxTimeframeElement.label = 'Timeframe Max';
        maxTimeframeElement.min = 2;
        maxTimeframeElement.max = 60 * 60;
        maxTimeframeElement.scaleUnitLabel = 's';
        maxTimeframeElement.step = 10;
        maxTimeframeElement.value = sampleSubsceneConfigParams[_selectedSubsceneIndex].params !== null ? Math.floor(sampleSubsceneConfigParams[_selectedSubsceneIndex].params.maxTimeframeLength / 1000) : 120;
    
        sampleContainer.appendChild(maxTimeframeElement);
    
        // groupHTMLParent.appendChild(sampleContainer);
        return sampleContainer;
    }
}

customElements.define('sample-card', SampleCardHTMLElement);
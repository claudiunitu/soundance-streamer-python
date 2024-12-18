// @ts-check


import './components/range-slider.component.js';
import './components/sample-toggler.component.js';
import './components/sample-card.component.js';

/**
 * @typedef {Object} SampleStitchingMethods
 * @property {string} JOIN_WITH_CROSSFADE When processed by the sound exporter fading will be applied to the looped samples
 * @property {string} JOIN_WITH_OVERLAY When processed by the sound exporter the loops will be overlaid but no fading will be applied to the looped samples. The samples files need to already be faded on both ends
 */

/**
 * @typedef {keyof SampleStitchingMethods} SampleStitchingMethod
 */

/** @type {SampleStitchingMethods} */
const SampleStitchingMethods = {
    JOIN_WITH_CROSSFADE: 'JOIN_WITH_CROSSFADE',
    JOIN_WITH_OVERLAY: 'JOIN_WITH_OVERLAY'
};

/**
 * @typedef {Object} SampleVariationAudioData
 * 
 * @property {string} variationFilePath 
 * @property {AudioBuffer | null} audioBuffer 
 * @property {boolean} isAudioBufferLoading 
 * @property {GainNode} gainNode 
 * 
 * 
 */

/**
 * @typedef {Object} SubsceneWindowsConfig
 * 
 * @property {number} currentVol 
 * @property {number} minVol 
 * @property {number} maxVol 
 * @property {number} minTimeframeLength 
 * @property {number} maxTimeframeLength 
 */

/**
 * @typedef {Object} SubsceneWindow
 * 
 * @property {number} startAt At which point (in milliseconds) the config should start when the final sound will be processed
 * @property {SubsceneWindowsConfig[]} config Subscene window config
 */

/**
 * @typedef {Object} SubsceneConfig
 * 
 * @property {string} label Subscene name
 * @property {SubsceneWindow[]} subsceneWindows Sequential config that to describe what happens at different time intervals
 */

/**
 * @typedef {Object} SoundSampleConfig
 * 
 * @property {number} concatOverlayMs How much to overlap when looping sound sample
 * @property {string} label Sound samples name
 * @property {SampleStitchingMethod} stitchingMethod Sound sample stitching method when looping
 * @property {string[]} variationNames Sound sample variations file paths
 */

/**
 * @typedef {Object} SoundSceneConfig
 * 
 * @property {string} directory Directory path for the sound files
 * @property {SoundSampleConfig[]} samples Sound samples config
 * @property {string} sceneName Sound samples config
 * @property {SubsceneConfig[]} subscenes Subscene config
 */

/** 
 * @type {SoundSceneConfig[]} will be populated with config.json data
 * */
let localConfigData;

/**
 * @typedef {Object} SampleSubsceneConfigParam
 * 
 * @property {string} label 
 * @property {SubsceneWindowsConfig | null} params 
 
 */
/**
 * @typedef {Object} LoadedSceneSamplesAudioData
 * 
 * @property {number | undefined | null} overlayTimeout 
 * @property {AudioBufferSourceNode | null} currentSource 
 * @property {SampleStitchingMethod} stitchingMethod 
 * @property {number} concatOverlayMs 
 * @property {SampleSubsceneConfigParam[]} sampleSubsceneConfigParams 
 * @property {SampleVariationAudioData[]} sampleVariationsAudioData 
 * @property {string} sampleLabel 
 */
/**
 * @type {LoadedSceneSamplesAudioData[]}
 */
let sceneSamplesAudioData = [];


/**
 * @type {AudioContext}
 */
let audioContext = new window.AudioContext();

/**
 * @type {boolean}
 */
let isStarted = true; // Flag to prevent re-initialization

/**
 * @type {{
 *  exportJsonButton: HTMLElement | null, 
 *  sendToBeProcessedButton: HTMLElement | null
 * }}
 */
const ctas = {
    exportJsonButton: document.getElementById('generateJsonButton'),
    sendToBeProcessedButton: document.getElementById('sendToProcessorButton'),
}

/**
 * @returns {void}
 */
function onLoadingStarted() {
    for (let ctaKey in ctas) {
        ctas[ctaKey].setAttribute("disabled", "disabled");
    }
}

/**
 * @returns {void}
 */
function onLoadingFinished() {
    for (let ctaKey in ctas) {
        ctas[ctaKey].removeAttribute("disabled");
    }
}


/**
 * @returns {Promise<SoundSceneConfig[]>}
 */
async function loadConfig() {
    onLoadingStarted();
    const config = await loadJson(`/config.json`).catch(e => { throw e });
    onLoadingFinished();
    return config;
}

/**
 * 
 * @param {SoundSceneConfig[]} scenes 
 * @param {number} _selectedSceneIndex 
 * @param {number} _selectedSubsceneIndex 
 * @param {number} _selectedSubsceneWindowIndex 
 * @returns {void}
 */
function initScene(scenes, _selectedSceneIndex, _selectedSubsceneIndex, _selectedSubsceneWindowIndex) {
    loadAndParseNewSceneData(scenes, _selectedSceneIndex, _selectedSubsceneIndex, _selectedSubsceneWindowIndex);
}

/**
 * 
 * @param {SoundSceneConfig[]} scenes 
 * @param {number} _selectedSceneIndex 
 * @param {number} _selectedSubsceneIndex 
 * @param {number} _selectedSubsceneWindowIndex 
 * @returns {LoadedSceneSamplesAudioData[]} 
 */
function loadAndParseDataForSceneData(scenes, _selectedSceneIndex, _selectedSubsceneIndex, _selectedSubsceneWindowIndex) {

    /** @type {LoadedSceneSamplesAudioData[]} */
    const returnObj = []
    const sceneObject = scenes[_selectedSceneIndex];
    for (let i = 0; i < sceneObject.samples.length; i++) {

        /**
         * @type {SampleVariationAudioData[]}
         */
        const sampleVariationsAudioData = [];


        const sampleSubsceneConfigParams = sceneObject.subscenes.map(scene => {
            return {
                label: scene.label,
                params: !scene.subsceneWindows[_selectedSubsceneWindowIndex] ? null : scene.subsceneWindows[_selectedSubsceneWindowIndex].config[i],
            }
        });

        for (let j = 0; j < sceneObject.samples[i].variationNames.length; j++) {
            const variationFilePath = `${sceneObject.samples[i].variationNames[j]}`;
            const audioBuffer = null;
            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);

            sampleVariationsAudioData.push({
                variationFilePath,
                audioBuffer,
                isAudioBufferLoading: false,
                gainNode,
            });

        }

        const stitchingMethod = sceneObject.samples[i].stitchingMethod;
        const concatOverlayMs = sceneObject.samples[i].concatOverlayMs;

        returnObj.push({
            overlayTimeout: null,
            currentSource: null,
            stitchingMethod,
            concatOverlayMs,
            sampleSubsceneConfigParams,
            sampleVariationsAudioData,
            sampleLabel: `${sceneObject.sceneName} - ${sceneObject.samples[i].label}`
        });
    }
    return returnObj
}

/**
 * @param {SoundSceneConfig[]} scenes
 * @param {number} _selectedSceneIndex
 * @param {number} _selectedSubsceneIndex
 * @param {number} _selectedSubsceneWindowIndex
 */
function loadAndParseNewSceneData(scenes, _selectedSceneIndex, _selectedSubsceneIndex, _selectedSubsceneWindowIndex) {

    onLoadingStarted();

    removeCurrentSliders();

    sceneSamplesAudioData = [];
    const slidersContainer = document.getElementById('sliders');

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {

        const sceneData = loadAndParseDataForSceneData(scenes, sceneIndex, _selectedSubsceneIndex, _selectedSubsceneWindowIndex);
        sceneSamplesAudioData = [...sceneSamplesAudioData, ...sceneData];

        const groupHTMLParent = document.createElement('div');
        const groupLabel = /** @type {HTMLLabelElement} */ (document.createElement('label'));
        groupLabel.classList.add('group-label');
        groupLabel.innerText = scenes[sceneIndex].sceneName;

        groupLabel.addEventListener('click', (event) => {
            /** @type {HTMLLabelElement} */
            const target = /** @type {HTMLLabelElement} */ (event.target);
            if (target.classList.contains('group-label-open')) {
                target.classList.remove('group-label-open');
            } else {
                target.classList.add('group-label-open');
            }
        })

        groupHTMLParent.appendChild(groupLabel);
        const groupSamplesWrapper = document.createElement('div');
        groupSamplesWrapper.classList.add('group-samples-wrapper');
        groupHTMLParent.appendChild(groupSamplesWrapper);

        sceneData.forEach((data) => {

            const sampleCardHTMLElement =/** @type {SampleCardHTMLElement} */(document.createElement('sample-card'));
            sampleCardHTMLElement.loadedSceneSampleAudioData = data;
            sampleCardHTMLElement.selectedSubsceneIndex = _selectedSubsceneIndex;
            sampleCardHTMLElement.selectedSubsceneWindowIndex = _selectedSubsceneWindowIndex;
            sampleCardHTMLElement.audioContext = audioContext;
            sampleCardHTMLElement.refreshUI();

            groupSamplesWrapper.appendChild(sampleCardHTMLElement)
        });

        slidersContainer?.appendChild(groupHTMLParent);
    }

    onLoadingFinished();
}

/**
 * 
 * @param {LoadedSceneSamplesAudioData} sceneSamplesAudio 
 */
function stopSceneSampleVariations(sceneSamplesAudio) {

    // for (let i = 0; i < sceneSamplesAudioData.length; i++) {
        if (sceneSamplesAudio.overlayTimeout) {

            clearTimeout(sceneSamplesAudio.overlayTimeout)
        }
        const currentSource = sceneSamplesAudio.currentSource;
        if (currentSource) {
            currentSource.stop();  // Stop the audio
            sceneSamplesAudio.currentSource = null;  // Clear the reference
        }
    // }
}

// Function to fetch and decode an audio file
async function loadSound(url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error(`Failed to load sound file at ${url}:`, error);
        return null; // Return null to prevent errors from breaking the whole program
    }
}
/**
 * @param {string} url URL of config.json file
 * @returns {Promise<SoundSceneConfig[]>}
 */
async function loadJson(url) {

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error fetching config file. Response status: ${response.status}`);
    }

    return await response.json();

}


function removeCurrentSliders() {
    const slidersContainer = document.getElementById('sliders');
    if (!slidersContainer) {
        return;
    }
    slidersContainer.innerHTML = '';
}


/**
 * @typedef {Object} SubsceneWindowsConfigExportable
 * @property {number} minVolRatio
 * @property {number} maxVolRatio
 * @property {number} minTimeframeLengthMs
 * @property {number} maxTimeframeLengthMs

 */
/**
 * @typedef {Object} SubsceneWindowExportable
 * 
 * @property {number} startAt At which point (in milliseconds) the config should start when the final sound will be processed
 * @property {SubsceneWindowsConfigExportable} params Subscene window config
 */

/**
 * @typedef {Object} ExportableSceneSamplesConfig
 * 
 * @property {string[]} variationFilePath
 * @property {SampleStitchingMethod} stitchingMethod
 * @property {number} concatOverlayMs
 * @property {SubsceneWindowExportable[]} timingWindows
 */
/**
 * 
 * @param {SoundSceneConfig} currentScene 
 * @param {SubsceneConfig} currentSubscene 
 * @returns {ExportableSceneSamplesConfig[]}
 */
function generateCurrentConfigJsonForScene(currentScene, currentSubscene) {
    return currentScene.samples.map((sample, sampleIndex) => {

        const timingWindows = currentSubscene.subsceneWindows.map((subsceneWindow, i) => {
            if (i === 0 && subsceneWindow.startAt !== 0) {
                throw new Error("The property 'startAt' needs to be 0 in the first timing window")
            }
            return {
                startAt: subsceneWindow.startAt,

                params: {

                    minVolRatio: subsceneWindow.config[sampleIndex].minVol / 100,
                    maxVolRatio: subsceneWindow.config[sampleIndex].maxVol / 100,
                    minTimeframeLengthMs: subsceneWindow.config[sampleIndex].minTimeframeLength,
                    maxTimeframeLengthMs: subsceneWindow.config[sampleIndex].maxTimeframeLength
                }
            }
        })

        const variationFilePath = sample.variationNames.map(variationName => `./webapp/src/${variationName}`);

        return {
            variationFilePath,
            stitchingMethod: sample.stitchingMethod,
            concatOverlayMs: sample.concatOverlayMs,
            timingWindows
        };
    })
        // do not add to export file the samples with max volume = 0
        .filter(mappedSample => mappedSample.timingWindows.some(timingWindow => timingWindow.params.maxVolRatio !== 0))
}

function generateCurrentConfigJSON(){
    let sampleDataConfig = []

    for (let sceneIndex = 0; sceneIndex < localConfigData.length; sceneIndex++) {
        sampleDataConfig = [...sampleDataConfig, ...generateCurrentConfigJsonForScene(localConfigData[sceneIndex], localConfigData[sceneIndex].subscenes[0])]
    }

    /** @type {HTMLInputElement} */
    const finalTrackLengthMinutesHtmlElement = /** @type {HTMLInputElement} */ (document.getElementById('finalTrackLengthMinutes'));
    
    const finalTrackLengthMilliseconds = parseInt(finalTrackLengthMinutesHtmlElement.value);
    
    const configData = {
        lengthMs: isNaN(finalTrackLengthMilliseconds) ? 60 * 60 * 1000 : finalTrackLengthMilliseconds * 60 * 1000,
        bitDepth: 16,
        sampleRate: 44100,
        format: 'wav', // aac = adts
        sampleDataConfig
    };

    const jsonString = JSON.stringify(configData, null, 2); // Pretty print the JSON
    return jsonString
}

function generateAndDownloadCurrentConfigJson() {
    downloadJsonFile(generateCurrentConfigJSON(), 'currentConfig.json'); // Trigger download
}

function sendToBeProcessed(){
    fetch('/process_json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: generateCurrentConfigJSON()
    }).then(data => console.log('Success:', data))
    .catch(error => console.error('Error:', error));
}

function downloadJsonFile(jsonString, filename) {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Free up memory
}

function addCtaEventListeners() {
    ctas.exportJsonButton?.addEventListener('click', generateAndDownloadCurrentConfigJson);
    ctas.sendToBeProcessedButton?.addEventListener('click', sendToBeProcessed);

}

function pollStatusAt() {
    setTimeout(()=>{
        fetch('/serve_status', {
            method: 'GET',
            headers: {}
        }).then((data) => {
            data.json().then((messages) => {
                document.getElementById('console').innerHTML = messages.map(message => `<p>${message}</p>`).join('')
            });
            pollStatusAt();
        }).catch(error => {
            console.error('Error:', error);
            pollStatusAt();
        });
    }, 5000)
        
    
}

/**
 * @param {SoundSceneConfig[]} config
 */
function initApp(config) {
    localConfigData = config;
    initScene(localConfigData, 0, 0, 0);
}

loadConfig().then((config) => {
    initApp(config)
    addCtaEventListeners();
    pollStatusAt();
}).catch(e => { throw e });




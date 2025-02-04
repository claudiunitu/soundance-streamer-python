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
 * @property {SubsceneWindowsConfig} config Subscene window config
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
 * @property {SubsceneWindowsConfig} config 
 */

/**
 * @typedef {Object} SoundSceneConfig
 * 
 * @property {SoundSampleConfig[]} samples Sound samples config
 * @property {string} sceneName Sound samples config
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
 * @property {SubsceneWindow} sampleSubsceneConfigParams 
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
 *  saveConfigToDisk: HTMLElement | null
 *  loadConfigFromDisk: HTMLElement | null
 *  savedSubscenesSelector: HTMLElement | null 
 *  currentSubsceneLabelInput: HTMLElement | null 
 * }}
 */
const ctas = {
    exportJsonButton: document.getElementById('generateJsonButton'),
    sendToBeProcessedButton: document.getElementById('sendToProcessorButton'),
    saveConfigToDisk: document.getElementById('saveConfigToDisk'),
    loadConfigFromDisk: document.getElementById('loadConfigFromDisk'),
    savedSubscenesSelector: document.getElementById('savedSubscenesSelector'),
    currentSubsceneLabelInput: document.getElementById('currentSubsceneLabelInput'),
    
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
    const config = await loadJson(`/config_all_in_one.json`).catch(e => { throw e });
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


        const sampleSubsceneConfigParams = {
                startAt: 0,
                config: scenes[_selectedSceneIndex].samples[i].config,
        };

        for (let j = 0; j < sceneObject.samples[i].variationNames.length; j++) {
            const variationFilePath = `${sceneObject.samples[i].variationNames[j]}`;
            const audioBuffer = null;
            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(scenes[_selectedSceneIndex].samples[i].config.currentVol || 0, audioContext.currentTime);

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
            sampleLabel: `${sceneObject.samples[i].label}`
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
        groupLabel.classList.add('group-label', 'group-label-open');
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
 * @returns {ExportableSceneSamplesConfig[]}
 */
function generateCurrentConfigJsonForScene(currentScene) {
    return currentScene.samples.map((sample, sampleIndex) => {

        const timingWindows = [{
            startAt: 0,
            params: {

                minVolRatio: sample.config.minVol / 100,
                maxVolRatio: sample.config.maxVol / 100,
                minTimeframeLengthMs: sample.config.minTimeframeLength,
                maxTimeframeLengthMs: sample.config.maxTimeframeLength
            }
        }];

        

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
        sampleDataConfig = [...sampleDataConfig, ...generateCurrentConfigJsonForScene(localConfigData[sceneIndex])]
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

/**
 * @typedef {Object} ExportableSceneSamplesConfigForSaveToDisk
 * 
 * @property {string} subsceneLabel
 * @property {ExportableSamplesConfigForSaveToDisk[]} config
 */
/**
 * @typedef {Object} ExportableSamplesConfigForSaveToDisk
 * 
 * @property {string} id
 * @property {SubsceneWindow} subsceneWindow
 */
/**
 * 
 * @param {LoadedSceneSamplesAudioData} currentScene 
 * @returns {ExportableSamplesConfigForSaveToDisk}
 */
function generateCurrentConfigForSaveToDiskForScene(currentScene) {

        return {
            id: currentScene.sampleLabel,
            subsceneWindow: currentScene.sampleSubsceneConfigParams
        };
    
}
/**
 * 
 * @returns {ExportableSceneSamplesConfigForSaveToDisk}
 */
function generateCurrentConfigForSaveToDisk() {

    if(!ctas.currentSubsceneLabelInput.value){
        alert("Please fill a subscene label");
        return;
    }
    
    /**
     * @type {ExportableSamplesConfigForSaveToDisk[]}
     */
    let dataToSave = [];

    for (let sceneIndex = 0; sceneIndex < sceneSamplesAudioData.length; sceneIndex++) {
        dataToSave = [...dataToSave, generateCurrentConfigForSaveToDiskForScene(sceneSamplesAudioData[sceneIndex])]
    }

    return {
        subsceneLabel: ctas.currentSubsceneLabelInput.value,
        config: dataToSave
    };
}

async function saveConfigToDisk(){
    const json = generateCurrentConfigForSaveToDisk();
    if(!json){
        return;
    }
    console.log(json);

    const currentJsonRequest = await fetch('/load_user_scenes_config',{
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(error => console.error('Error:', error));


    if(currentJsonRequest && currentJsonRequest.status >= 200 && currentJsonRequest.status < 300){

        /** @type {ExportableSceneSamplesConfigForSaveToDisk[]} */
        const currentParsedJson = await currentJsonRequest.json();


        const existingSavedConfigSubsceneIndex = currentParsedJson.findIndex(currentParsedJsonItem => currentParsedJsonItem.subsceneLabel === json.subsceneLabel);
        if(existingSavedConfigSubsceneIndex > -1){
            currentParsedJson[existingSavedConfigSubsceneIndex] = json;
        } else {
            currentParsedJson.push(json)
        }
        await fetch('/save_user_scenes_config',{
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentParsedJson)
        }).catch(error => console.error('Error:', error));
    } else {
        await fetch('/save_user_scenes_config',{
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([json])
        }).catch(error => console.error('Error:', error));
    }

}

function onSelectedSubscene(selectedSubsceneLabel){
    ctas.currentSubsceneLabelInput.value = selectedSubsceneLabel;

}
/**
 * 
 * @param {string} sceneLabel 
 */
async function loadConfigFromDisk(sceneLabel){

    const currentJsonRequest = await fetch('/load_user_scenes_config',{
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(error => console.error('Error:', error));


    if(!(currentJsonRequest && currentJsonRequest.status >= 200 && currentJsonRequest.status < 300)){
        return;
    }

    /** @type {ExportableSceneSamplesConfigForSaveToDisk[]} */
    const json = await currentJsonRequest.json();

    const savedSubscene = json.find(jsonItem => jsonItem.subsceneLabel === sceneLabel);

    if(!savedSubscene){
        return;
    }

    for (let sceneIndex = 0; sceneIndex < sceneSamplesAudioData.length; sceneIndex++) {

        // if the current scene has a saved config
        sceneSamplesAudioData.forEach((loadedSample, sampleIndex) => {
            const foundSavedSampleConfig = savedSubscene.config.find(jsonItem => jsonItem.id === loadedSample.sampleLabel);
            if(foundSavedSampleConfig){
                const isVolChanged = loadedSample.sampleSubsceneConfigParams.config.currentVol !== foundSavedSampleConfig.subsceneWindow.config.currentVol;
                const isMinVolChanged = loadedSample.sampleSubsceneConfigParams.config.minVol !== foundSavedSampleConfig.subsceneWindow.config.minVol;
                const isMaxVolChanged = loadedSample.sampleSubsceneConfigParams.config.maxVol !== foundSavedSampleConfig.subsceneWindow.config.maxVol;
                const isTFMinChanged = loadedSample.sampleSubsceneConfigParams.config.minTimeframeLength !== foundSavedSampleConfig.subsceneWindow.config.minTimeframeLength;
                const isTFmaxChanged = loadedSample.sampleSubsceneConfigParams.config.maxTimeframeLength !== foundSavedSampleConfig.subsceneWindow.config.maxTimeframeLength;

                
                
                
                loadedSample.sampleSubsceneConfigParams.startAt = foundSavedSampleConfig.subsceneWindow.startAt;
                
                if(isVolChanged){
                    /** @type {RangeSliderHTMLElement} */
                    const sampleVolumeElement = /** @type {RangeSliderHTMLElement} */ document.querySelectorAll('sample-card')[sampleIndex].shadowRoot.querySelector('.volume-slider');
                    loadedSample.sampleSubsceneConfigParams.config.currentVol = foundSavedSampleConfig.subsceneWindow.config.currentVol;
                    sampleVolumeElement.value = loadedSample.sampleSubsceneConfigParams.config.currentVol;
                    sampleVolumeElement.dispatchEvent(new Event('valueChange'));
                }
                if(isMinVolChanged){
                    /** @type {RangeSliderHTMLElement} */
                    const sampleVolumeMinElement = /** @type {RangeSliderHTMLElement} */ document.querySelectorAll('sample-card')[sampleIndex].shadowRoot.querySelector('.volume-min-slider');
                    loadedSample.sampleSubsceneConfigParams.config.minVol = foundSavedSampleConfig.subsceneWindow.config.minVol;
                    sampleVolumeMinElement.value = loadedSample.sampleSubsceneConfigParams.config.minVol;
                    sampleVolumeMinElement.dispatchEvent(new Event('valueChange'));
                }
                if(isMaxVolChanged){
                    /** @type {RangeSliderHTMLElement} */
                    const sampleVolumeMaxElement = /** @type {RangeSliderHTMLElement} */ document.querySelectorAll('sample-card')[sampleIndex].shadowRoot.querySelector('.volume-max-slider');
                    loadedSample.sampleSubsceneConfigParams.config.maxVol = foundSavedSampleConfig.subsceneWindow.config.maxVol;
                    sampleVolumeMaxElement.value = loadedSample.sampleSubsceneConfigParams.config.maxVol;
                    sampleVolumeMaxElement.dispatchEvent(new Event('valueChange'));
                }
                if(isTFMinChanged){
                    /** @type {RangeSliderHTMLElement} */
                    const sampleTimeframeMinElement = /** @type {RangeSliderHTMLElement} */ document.querySelectorAll('sample-card')[sampleIndex].shadowRoot.querySelector('.timeframe-min-slider');
                    loadedSample.sampleSubsceneConfigParams.config.minTimeframeLength = foundSavedSampleConfig.subsceneWindow.config.minTimeframeLength;
                    sampleTimeframeMinElement.value = loadedSample.sampleSubsceneConfigParams.config.minTimeframeLength;
                    sampleTimeframeMinElement.dispatchEvent(new Event('valueChange'));
                }
                if(isTFmaxChanged){
                    /** @type {RangeSliderHTMLElement} */
                    const sampleTimeframeMaxElement = /** @type {RangeSliderHTMLElement} */ document.querySelectorAll('sample-card')[sampleIndex].shadowRoot.querySelector('.timeframe-max-slider');
                    loadedSample.sampleSubsceneConfigParams.config.maxTimeframeLength = foundSavedSampleConfig.subsceneWindow.config.maxTimeframeLength;
                    sampleTimeframeMaxElement.value = loadedSample.sampleSubsceneConfigParams.config.maxTimeframeLength;
                    sampleTimeframeMaxElement.dispatchEvent(new Event('valueChange'));
                }
            }
            
        });
        
    

    }
    
}

function addCtaEventListeners() {
    ctas.exportJsonButton?.addEventListener('click', generateAndDownloadCurrentConfigJson);
    ctas.sendToBeProcessedButton?.addEventListener('click', sendToBeProcessed);
    ctas.saveConfigToDisk?.addEventListener('click', saveConfigToDisk);
    ctas.savedSubscenesSelector?.addEventListener('click', (event) => onSelectedSubscene(event.target.value ));
    ctas.loadConfigFromDisk?.addEventListener('click', (event) => loadConfigFromDisk(ctas.savedSubscenesSelector.value ));


}

function pollStatusAt() {
    setTimeout(()=>{
        fetch('/serve_status', {
            method: 'GET',
            headers: {}
        }).then((data) => {
            data.json().then((messages) => {
                const container = document.getElementById('console-content');
                container.innerHTML = messages.map(message => `<p>${message}</p>`).join('');
                container.scrollTop = container.scrollHeight;
            });
            pollStatusAt();
        }).catch(error => {
            console.error('Error:', error);
            pollStatusAt();
        });
    }, 5000)
        
    
}





async function loadUserScenesConfig(){
    const currentJsonRequest = await fetch('/load_user_scenes_config',{
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(error => console.error('Error:', error));


    if(!(currentJsonRequest && currentJsonRequest.status >= 200 && currentJsonRequest.status < 300)){
        return;
    }

    /** @type {ExportableSceneSamplesConfigForSaveToDisk[]} */
    const savedSubscenes = await currentJsonRequest.json();
    savedSubscenes.forEach(subscene => {
        const option = document.createElement('option');
        option.innerText = subscene.subsceneLabel;
        option.value = subscene.subsceneLabel;
        ctas.savedSubscenesSelector.append(option)
    })
    
}

/**
 * @param {SoundSceneConfig[]} config
 */
function initApp(config) {
    localConfigData = config;
    initScene(localConfigData, 0, 0, 0);
}

loadConfig().then((config) => {
    loadUserScenesConfig().then();
    initApp(config)
    addCtaEventListeners();
    pollStatusAt();
}).catch(e => { throw e });




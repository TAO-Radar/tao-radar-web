const version = '0.0.1'
const DEFAULT_WELCOME_PARAM = 'widgetParameter (base64 payload)'
const ALLOWED_WIDGET_FAMILIES = ['small', 'medium', 'large']
const LIBRARY_BASE_URL =
    'https://gitlab.com/tao-radar/scriptable-widgets/-/jobs/artifacts/main/raw/dist/raw/main?job=package_scriptable_artifacts'

const welcomeLibraryInfo = {
    moduleUrl: buildLibraryResourceUrl(LIBRARY_BASE_URL, 'welcome.js'),
    cacheKey: 'welcome_main',
}

async function launch(params = {}) {
    const runtimeConfig = params.config || {}
    if (!runtimeConfig.runsInWidget) {
        try {
            const moduleLoader = importLocalModuleLoader()
            const welcomeModulePath = await moduleLoader.importVersionedModule({
                library: welcomeLibraryInfo,
                scriptPath: module.filename,
                debug: !!params.debug,
                logLabel: 'launcher',
                importModuleFn: importModule,
            })
            const welcomeLibrary = importModule(welcomeModulePath)
            const welcomeParams = {
                widgetParameter: DEFAULT_WELCOME_PARAM,
                debug: !!params.debug,
                loaderVersion: String(params.loaderVersion || version),
            }
            const familyError = validateFamilySupport(welcomeLibrary, runtimeConfig.widgetFamily)
            if (familyError) {
                const widget = createErrorWidget('Unsupported widget size', familyError)
                return presentAndComplete(widget, runtimeConfig)
            }
            const widget = await welcomeLibrary.createWidget(welcomeParams)
            return presentAndComplete(widget, runtimeConfig)
        } catch (error) {
            const widget = createErrorWidget(
                'Unable to load welcome script',
                error && error.message ? error.message : String(error)
            )
            return presentAndComplete(widget, runtimeConfig)
        }
    }

    const providedParam = resolveProvidedWidgetParameter(params.args, runtimeConfig)
    if (!providedParam || providedParam.trim().length === 0) {
        const widget = createErrorWidget(
            'Configuration required',
            'Pass widgetParameter as a base64-encoded JSON string.'
        )
        return presentAndComplete(widget, runtimeConfig)
    }

    let payload = null
    try {
        payload = decodeWidgetPayload(providedParam)
    } catch (error) {
        const widget = createErrorWidget(
            'Invalid widgetParameter',
            'Unable to decode base64 JSON payload.'
        )
        return presentAndComplete(widget, runtimeConfig)
    }

    const validationError = validateWidgetPayload(payload)
    if (validationError) {
        const widget = createErrorWidget('Invalid payload', validationError)
        return presentAndComplete(widget, runtimeConfig)
    }

    const targetLibraryInfo = {
        moduleUrl: payload.moduleUrl,
        manifestUrl: payload.manifestUrl,
        cacheKey: payload.cacheKey || 'target',
    }

    try {
        const moduleLoader = importLocalModuleLoader()
        const targetModulePath = await moduleLoader.importVersionedModule({
            library: targetLibraryInfo,
            scriptPath: module.filename,
            debug: !!params.debug,
            logLabel: 'launcher',
            importModuleFn: importModule,
        })
        const targetLibrary = importModule(targetModulePath)

        const childParams =
            payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
                ? payload.params
                : {}
        const libraryWidgetParam =
            targetLibrary && typeof targetLibrary.widgetParameter === 'string'
                ? targetLibrary.widgetParameter.trim()
                : ''
        const resolvedWidgetParam = resolveWidgetParameter(libraryWidgetParam, childParams)
        const paramRequired = libraryWidgetParam && libraryWidgetParam.length > 0

        if (paramRequired && (!resolvedWidgetParam || resolvedWidgetParam.trim().length === 0)) {
            const widget = createErrorWidget(
                'Missing required parameter',
                `This widget expects "${libraryWidgetParam}" in payload.params.`
            )
            return presentAndComplete(widget, runtimeConfig)
        }

        const createWidgetParams = {
            widgetParameter: resolvedWidgetParam,
            debug: !!params.debug,
            apiKey: params.apiKey,
            apiProvider: params.apiProvider,
            loaderVersion: String(params.loaderVersion || version),
            widgetPayload: payload,
            ...childParams,
            ...runtimeConfig,
        }
        const familyError = validateFamilySupport(targetLibrary, runtimeConfig.widgetFamily)
        if (familyError) {
            const widget = createErrorWidget('Unsupported widget size', familyError)
            return presentAndComplete(widget, runtimeConfig)
        }
        const widget = await targetLibrary.createWidget(createWidgetParams)
        return presentAndComplete(widget, runtimeConfig)
    } catch (error) {
        const widget = createErrorWidget(
            'Unable to load target script',
            error && error.message ? error.message : String(error)
        )
        return presentAndComplete(widget, runtimeConfig)
    }
}

async function presentAndComplete(widget, runtimeConfig) {
    if (runtimeConfig.runsInWidget) {
        Script.setWidget(widget)
    } else {
        await widget.presentLarge()
    }
    Script.complete()
}

function createErrorWidget(title, message) {
    const widget = new ListWidget()
    widget.addText(title)
    widget.addSpacer(6)
    widget.addText(message)
    return widget
}   

function importLocalModuleLoader() {
    if (typeof importModule !== 'function') {
        throw new Error('Scriptable runtime error: importModule is undefined in launcher.')
    }
    const fm = FileManager.local()
    const scriptPath = module.filename
    const scriptDir = scriptPath.replace(fm.fileName(scriptPath, true), '')
    const absoluteModulePath = fm.joinPath(scriptDir, 'module-loader_main.js')
    return importModule(absoluteModulePath)
}

function decodeWidgetPayload(base64String) {
    const data = Data.fromBase64String(String(base64String).trim())
    if (!data) throw new Error('Invalid base64')
    const jsonString = data.toRawString()
    return JSON.parse(jsonString)
}

function validateWidgetPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return 'widgetParameter payload must be a JSON object.'
    }
    if (!payload.moduleUrl || typeof payload.moduleUrl !== 'string') {
        return 'Payload field "moduleUrl" is required.'
    }
    if (payload.manifestUrl && typeof payload.manifestUrl !== 'string') {
        return 'Payload field "manifestUrl" must be a string when provided.'
    }
    if (payload.cacheKey && typeof payload.cacheKey !== 'string') {
        return 'Payload field "cacheKey" must be a string when provided.'
    }
    if (payload.params && (typeof payload.params !== 'object' || Array.isArray(payload.params))) {
        return 'Payload field "params" must be an object when provided.'
    }
    return null
}

function resolveWidgetParameter(requiredParamName, childParams) {
    if (!requiredParamName || requiredParamName.length === 0) return ''
    if (childParams && Object.prototype.hasOwnProperty.call(childParams, requiredParamName)) {
        return String(childParams[requiredParamName] ?? '')
    }
    if (childParams && Object.prototype.hasOwnProperty.call(childParams, 'widgetParameter')) {
        return String(childParams.widgetParameter ?? '')
    }
    return ''
}

function validateFamilySupport(library, requestedFamilyRaw) {
    const requestedFamily = normalizeWidgetFamily(requestedFamilyRaw)
    if (!requestedFamily) {
        return null
    }
    const supportedFamilies = readSupportedFamilies(library)
    if (!supportedFamilies) {
        return null
    }
    if (supportedFamilies.indexOf(requestedFamily) !== -1) {
        return null
    }
    return `This script does not support "${requestedFamily}". Supported: ${supportedFamilies.join(', ')}.`
}

function readSupportedFamilies(library) {
    if (!library || !Array.isArray(library.supportedFamilies)) {
        return null
    }
    const normalized = []
    for (const family of library.supportedFamilies) {
        const value = normalizeWidgetFamily(family)
        if (value && normalized.indexOf(value) === -1) {
            normalized.push(value)
        }
    }
    return normalized.length > 0 ? normalized : null
}

function normalizeWidgetFamily(value) {
    if (!value || typeof value !== 'string') {
        return null
    }
    const normalized = value.trim().toLowerCase()
    return ALLOWED_WIDGET_FAMILIES.indexOf(normalized) !== -1 ? normalized : null
}

function resolveProvidedWidgetParameter(runtimeArgs, runtimeConfig) {
    if (runtimeArgs && typeof runtimeArgs.widgetParameter === 'string') {
        return runtimeArgs.widgetParameter
    }
    if (runtimeConfig && typeof runtimeConfig.widgetParameter === 'string') {
        return runtimeConfig.widgetParameter
    }
    return ''
}

function buildLibraryResourceUrl(baseUrl, fileName) {
    const parts = String(baseUrl).split('?')
    const basePath = parts[0].replace(/\/+$/, '')
    const query = parts.length > 1 ? parts.slice(1).join('?') : ''
    return query ? `${basePath}/${fileName}?${query}` : `${basePath}/${fileName}`
}

module.exports = {
    version,
    launch,
}

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: download;

const DEBUG = !config.runsInWidget
const version = '2.0.0'
const log = DEBUG ? console.log.bind(console) : function () { }

const apiKey = '${API_KEY}'
const apiProvider = '${API_PROVIDER}'
const DEFAULT_LIBRARY_BASE_URL =
    'https://gitlab.com/tao-radar/scriptable-widgets/-/jobs/artifacts/main/raw/dist/raw/main?job=package_scriptable_artifacts'
const INJECTED_LIBRARY_BASE_URL = '${LIBRARY_BASE_URL}'
const libraryBaseUrl = resolveLibraryBaseUrl()

const launcherLibraryInfo = {
    moduleUrl: buildLibraryResourceUrl(libraryBaseUrl, 'launcher.js'),
    cacheKey: 'launcher_main',
}

const moduleLoaderLibraryInfo = {
    moduleUrl: buildLibraryResourceUrl(libraryBaseUrl, 'module-loader.js'),
    cacheKey: 'module-loader_main',
}

const launcherConfig = {
    config,
    args,
    apiKey,
    apiProvider,
    libraryBaseUrl,
    debug: DEBUG,
    loaderVersion: version,
}

const hasInjectedApiKey = apiKey && apiKey.trim().length > 0 && !apiKey.startsWith('${')
const hasInjectedApiProvider = apiProvider && apiProvider.trim().length > 0 && !apiProvider.startsWith('${')
const hasRuntimeImportModule = typeof importModule === 'function'

if (!hasInjectedApiKey || !hasInjectedApiProvider) {
    throw new Error('Loader placeholders were not injected. Please download the script through TAO Radar web app.')
}
if (!hasRuntimeImportModule) {
    throw new Error('Scriptable runtime error: importModule is undefined in web-main.')
}

const moduleLoader = await importBootstrapModule(moduleLoaderLibraryInfo)
const launcherModulePath = await moduleLoader.importVersionedModule({
    library: launcherLibraryInfo,
    scriptPath: module.filename,
    debug: DEBUG,
    logLabel: 'loader',
    importModuleFn: importModule,
})
const launcher = importModule(launcherModulePath)
await launcher.launch(launcherConfig)

async function importBootstrapModule(library) {
    const fm = FileManager.local()
    const scriptPath = module.filename
    const moduleDir = scriptPath.replace(fm.fileName(scriptPath, true), fm.fileName(scriptPath, false))

    if (fm.fileExists(moduleDir) && !fm.isDirectory(moduleDir)) {
        fm.remove(moduleDir)
    }
    if (!fm.fileExists(moduleDir)) {
        fm.createDirectory(moduleDir)
    }

    const fileName = `${library.cacheKey || 'module'}.js`
    const localPath = fm.joinPath(moduleDir, fileName)
    const relativeModulePath = `${fm.fileName(scriptPath, false)}/${fileName}`
    const hasLocal = fm.fileExists(localPath)
    const localVersion = readImportedModuleVersion(importModule, relativeModulePath)
    let remoteVersion = null

    try {
        const stageTracker = createStageTracker('loader', log)
        const endManifestStage = stageTracker.start('manifest fetch', 1500)
        try {
            const manifestReq = new Request(buildLibraryManifestUrl(library))
            const manifestJson = JSON.parse(await manifestReq.loadString())
            if (isValidManifest(manifestJson)) {
                remoteVersion = manifestJson.version
            }
        } finally {
            endManifestStage()
        }
    } catch (error) {
        remoteVersion = null
    }

    if (hasLocal && localVersion && remoteVersion && localVersion === remoteVersion) {
        log('[loader] bootstrap versions match, using local module')
        return importModule(relativeModulePath)
    }
    if (hasLocal && localVersion && !remoteVersion) {
        log('[loader] bootstrap manifest unavailable, using local module')
        return importModule(relativeModulePath)
    }

    let remoteContent = null
    try {
        const stageTracker = createStageTracker('loader', log)
        const endStage = stageTracker.start('bootstrap download', 3000)
        const req = new Request(buildLibraryUrl(library))
        remoteContent = await req.loadString()
        endStage()
    } catch (error) {
        if (fm.fileExists(localPath)) {
            log('[loader] bootstrap download failed, fallback to local module')
            return importModule(relativeModulePath)
        }
        throw error
    }

    fm.write(localPath, Data.fromString(remoteContent))
    log('[loader] downloaded bootstrap module')
    return importModule(relativeModulePath)
}

function buildLibraryUrl(library) {
    return String(library.moduleUrl)
}

function buildLibraryManifestUrl(library) {
    if (library.manifestUrl) {
        return String(library.manifestUrl)
    }
    return deriveManifestUrlFromModuleUrl(String(library.moduleUrl))
}

function buildLibraryResourceUrl(baseUrl, fileName) {
    const parts = String(baseUrl).split('?')
    const basePath = parts[0].replace(/\/+$/, '')
    const query = parts.length > 1 ? parts.slice(1).join('?') : ''
    return query ? `${basePath}/${fileName}?${query}` : `${basePath}/${fileName}`
}

function deriveManifestUrlFromModuleUrl(moduleUrl) {
    const parts = String(moduleUrl).split('?')
    const urlPath = parts[0]
    const query = parts.length > 1 ? parts.slice(1).join('?') : ''
    const manifestPath = urlPath.replace(/\.js$/i, '.manifest.json')
    return query ? `${manifestPath}?${query}` : manifestPath
}

function readImportedModuleVersion(importModuleFn, relativeModulePath) {
    try {
        const localModule = importModuleFn(relativeModulePath)
        return localModule && typeof localModule.version === 'string' ? localModule.version : null
    } catch (error) {
        return null
    }
}

function isValidManifest(manifest) {
    return !!manifest && typeof manifest === 'object' && typeof manifest.version === 'string'
}

function createStageTracker(logLabel, logFn) {
    function nowIso() {
        return new Date().toISOString()
    }
    function estimateCompletion(estimatedMs) {
        return new Date(Date.now() + estimatedMs).toISOString()
    }
    return {
        start(stageName, estimatedMs) {
            const startedAt = Date.now()
            logFn(`[${logLabel}] stage="${stageName}" start=${nowIso()} eta=${estimateCompletion(estimatedMs)}`)
            return function endStage() {
                const endedAt = Date.now()
                logFn(
                    `[${logLabel}] stage="${stageName}" stop=${new Date(endedAt).toISOString()} duration_ms=${endedAt - startedAt}`
                )
            }
        },
    }
}

function resolveLibraryBaseUrl() {
    if (
        typeof INJECTED_LIBRARY_BASE_URL === 'string' &&
        INJECTED_LIBRARY_BASE_URL.trim().length > 0 &&
        !INJECTED_LIBRARY_BASE_URL.startsWith('${')
    ) {
        return INJECTED_LIBRARY_BASE_URL.trim()
    }
    return DEFAULT_LIBRARY_BASE_URL
}

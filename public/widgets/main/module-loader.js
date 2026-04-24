const version = '0.0.1'

async function importVersionedModule(params = {}) {
    const library = params.library || {}
    const scriptPath = params.scriptPath || (module && module.filename ? module.filename : '')
    const debug = !!params.debug
    const logLabel = params.logLabel || 'module-loader'
    const importModuleFn = typeof params.importModuleFn === 'function' ? params.importModuleFn : null
    const log = debug ? console.log.bind(console) : function () { }
    const stageTracker = createStageTracker(logLabel, log)

    if (!scriptPath) {
        throw new Error('scriptPath is required for importVersionedModule')
    }
    if (!library.moduleUrl) {
        throw new Error('library info is incomplete for importVersionedModule')
    }

    const fm = FileManager.local()
    const moduleDir = scriptPath.replace(fm.fileName(scriptPath, true), fm.fileName(scriptPath, false))
    ensureModuleDirectory(fm, moduleDir)

    const fileName = buildLibraryModuleFileName(library)
    const localPath = fm.joinPath(moduleDir, fileName)
    const localVersionCachePath = fm.joinPath(moduleDir, `${fileName}.version.json`)
    const relativeModulePath = `${fm.fileName(scriptPath, false)}/${fileName}`
    const hasLocal = fm.fileExists(localPath)

    const localVersion = readLocalVersion({
        fm,
        cachePath: localVersionCachePath,
        modulePath: localPath,
        importModuleFn,
        relativeModulePath,
    })
    log(`[${logLabel}] local module: ${fileName}, hasLocal=${hasLocal}, localVersion=${localVersion || 'unknown'}`)

    let remoteVersion = null
    try {
        const endStage = stageTracker.start('manifest fetch', 1500)
        try {
            const manifestReq = new Request(buildLibraryManifestUrl(library))
            const manifestJson = JSON.parse(await manifestReq.loadString())
            if (isValidManifest(manifestJson)) {
                remoteVersion = manifestJson.version
            }
        } finally {
            endStage()
        }
    } catch (error) {
        remoteVersion = null
    }
    log(`[${logLabel}] remote manifest version=${remoteVersion || 'unknown'}`)

    if (hasLocal && localVersion && remoteVersion && localVersion === remoteVersion) {
        log(`[${logLabel}] versions match, using local module`)
        return relativeModulePath
    }
    if (hasLocal && localVersion && !remoteVersion) {
        log(`[${logLabel}] manifest unavailable, using local module`)
        return relativeModulePath
    }

    try {
        const endFetchStage = stageTracker.start('module download', 3000)
        const req = new Request(buildLibraryUrl(library))
        const remoteContent = await req.loadString()
        endFetchStage()
        const endWriteStage = stageTracker.start('cache write', 300)
        fm.write(localPath, Data.fromString(remoteContent))
        if (remoteVersion) {
            fm.write(localVersionCachePath, Data.fromString(JSON.stringify({ version: remoteVersion })))
        }
        endWriteStage()
        log(`[${logLabel}] downloaded and cached module`)
        return relativeModulePath
    } catch (error) {
        if (hasLocal) {
            log(`[${logLabel}] download failed, fallback to local module`)
            return relativeModulePath
        }
        throw error
    }
}

function createStageTracker(logLabel, log) {
    function nowIso() {
        return new Date().toISOString()
    }
    function estimateCompletion(estimatedMs) {
        return new Date(Date.now() + estimatedMs).toISOString()
    }
    return {
        start(stageName, estimatedMs) {
            const startedAt = Date.now()
            log(`[${logLabel}] stage="${stageName}" start=${nowIso()} eta=${estimateCompletion(estimatedMs)}`)
            return function endStage() {
                const endedAt = Date.now()
                log(
                    `[${logLabel}] stage="${stageName}" stop=${new Date(endedAt).toISOString()} duration_ms=${endedAt - startedAt}`
                )
            }
        },
    }
}

function ensureModuleDirectory(fm, moduleDir) {
    if (fm.fileExists(moduleDir) && !fm.isDirectory(moduleDir)) {
        fm.remove(moduleDir)
    }
    if (!fm.fileExists(moduleDir)) {
        fm.createDirectory(moduleDir)
    }
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

function buildLibraryModuleFileName(library) {
    return `${buildLibraryCacheKey(library)}.js`
}

function buildLibraryCacheKey(library) {
    if (library.cacheKey && typeof library.cacheKey === 'string') {
        return sanitizeKey(library.cacheKey)
    }
    return 'main'
}

function sanitizeKey(value) {
    return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'main'
}

function deriveManifestUrlFromModuleUrl(moduleUrl) {
    const parts = String(moduleUrl).split('?')
    const urlPath = parts[0]
    const query = parts.length > 1 ? parts.slice(1).join('?') : ''
    const manifestPath = urlPath.replace(/\.js$/i, '.manifest.json')
    return query ? `${manifestPath}?${query}` : manifestPath
}

function isValidManifest(manifest) {
    return !!manifest && typeof manifest === 'object' && typeof manifest.version === 'string'
}

function readLocalVersion(params) {
    const fm = params.fm
    const cachePath = params.cachePath
    const modulePath = params.modulePath
    const importModuleFn = params.importModuleFn
    const relativeModulePath = params.relativeModulePath

    const cachedVersion = readLocalCachedVersion(fm, cachePath)
    if (cachedVersion) {
        return cachedVersion
    }
    const importedModuleVersion = readImportedModuleVersion(importModuleFn, relativeModulePath)
    if (importedModuleVersion) {
        return importedModuleVersion
    }
    return readLocalModuleVersion(fm, modulePath)
}

function readLocalCachedVersion(fm, cachePath) {
    if (!fm.fileExists(cachePath)) {
        return null
    }
    try {
        const content = fm.readString(cachePath)
        const json = JSON.parse(content)
        return json && typeof json.version === 'string' ? json.version : null
    } catch (error) {
        return null
    }
}

function readLocalModuleVersion(fm, modulePath) {
    if (!fm.fileExists(modulePath)) {
        return null
    }
    try {
        const content = fm.readString(modulePath)
        const constVersionMatch = content.match(/const\s+version\s*=\s*['"]([^'"]+)['"]/)
        if (constVersionMatch && constVersionMatch[1]) {
            return constVersionMatch[1]
        }
        const exportsVersionMatch = content.match(/version\s*:\s*['"]([^'"]+)['"]/)
        if (exportsVersionMatch && exportsVersionMatch[1]) {
            return exportsVersionMatch[1]
        }
        return null
    } catch (error) {
        return null
    }
}

function readImportedModuleVersion(importModuleFn, relativeModulePath) {
    if (!importModuleFn || !relativeModulePath) {
        return null
    }
    try {
        const localModule = importModuleFn(relativeModulePath)
        return localModule && typeof localModule.version === 'string' ? localModule.version : null
    } catch (error) {
        return null
    }
}

module.exports = {
    version,
    importVersionedModule,
    buildLibraryUrl,
    buildLibraryManifestUrl,
    buildLibraryModuleFileName,
}

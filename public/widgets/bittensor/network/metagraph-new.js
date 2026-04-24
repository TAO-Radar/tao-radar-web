// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cube;

const version = '0.0.1'
const supportedFamilies = ['small', 'medium', 'large']
const widgetParameter = 'message'

async function createWidget(params = {}) {
    const family = normalizeFamily(params.widgetFamily)
    const message = resolveMessage(params)

    const widget = new ListWidget()
    widget.backgroundColor = new Color('#0B1220')

    const title = widget.addText('Hello from TAO Radar')
    title.font = Font.boldSystemFont(family === 'small' ? 12 : 16)
    title.textColor = new Color('#60A5FA')
    title.centerAlignText()

    widget.addSpacer(family === 'large' ? 10 : 6)

    const body = widget.addText(message)
    body.font = Font.mediumSystemFont(family === 'small' ? 10 : 13)
    body.textColor = Color.white()
    body.centerAlignText()

    if (family !== 'small') {
        widget.addSpacer(6)
        const hint = widget.addText('Powered by metagraph-new.js')
        hint.font = Font.systemFont(10)
        hint.textColor = Color.gray()
        hint.centerAlignText()
    }

    return widget
}

function normalizeFamily(value) {
    const allowed = ['small', 'medium', 'large']
    const normalized = String(value || 'large').trim().toLowerCase()
    return allowed.indexOf(normalized) !== -1 ? normalized : 'large'
}

function resolveMessage(params) {
    const explicit = params.message
    if (typeof explicit === 'string' && explicit.trim().length > 0) {
        return explicit.trim()
    }
    const widgetParam = params.widgetParameter
    if (typeof widgetParam === 'string' && widgetParam.trim().length > 0) {
        return widgetParam.trim()
    }
    return 'Hello world'
}

module.exports = {
    version,
    supportedFamilies,
    widgetParameter,
    createWidget,
}

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
//@ts-check

const version = '0.0.3'
const supportedFamilies = ['small', 'medium', 'large']

/**
 * Create the welcome widget
 * @param {{widgetParameter: string, debug: string, loaderVersion: string}} config widget configuration
 *   widgetParameter: The expected widget parameter name from the library (optional)
 *   loaderVersion: The version of the loader script (optional)
 */
async function createWidget(config) {
    const log = config.debug ? console.log.bind(console) : function () {};
    log(JSON.stringify(config, null, 2))

    const expectedParamName = config.widgetParameter || null

    // @ts-ignore
    const widget = new ListWidget()

    // Basic light/dark background
    widget.backgroundColor = Color.dynamic(
        new Color('#000000'),
        new Color('#000000')
    )

    const title = widget.addText('👋 Welcome to TAO Radar')
    title.font = Font.boldSystemFont(16)
    title.textColor = new Color('#FFD700') // gold
    title.centerAlignText()

    widget.addSpacer(8)

    if (expectedParamName) {
        const t1 = widget.addText('Please configure this widget')
        t1.font = Font.mediumSystemFont(13)
        t1.textColor = Color.gray()
        t1.centerAlignText()

        const t2 = widget.addText('by setting a widget parameter')
        t2.font = Font.mediumSystemFont(12)
        t2.textColor = Color.gray()
        t2.centerAlignText()

        widget.addSpacer(6)

        const t3 = widget.addText(`Expected: ${expectedParamName}`)
        t3.font = Font.boldSystemFont(12)
        t3.textColor = new Color('#00FFC3')
        t3.centerAlignText()
    } else {
        const t = widget.addText('This widget is ready to use (no parameter required).')
        t.font = Font.mediumSystemFont(13)
        t.textColor = Color.gray()
        t.centerAlignText()
    }

    widget.addSpacer(10)

    // Footer on one line with "Hand of Midas" in turquoise
    // Use a centered horizontal stack
    const footerContainer = widget.addStack()
    footerContainer.layoutHorizontally()
    footerContainer.centerAlignContent()
    
    // Add flexible spacer before to push content to center
    footerContainer.addSpacer()
    
    const footerStack = footerContainer.addStack()
    footerStack.layoutHorizontally()
    
    const footer1 = footerStack.addText('Made with ❤️ by ')
    footer1.font = Font.systemFont(10)
    footer1.textColor = Color.gray()
    
    const footer2 = footerStack.addText('Hand of Midas')
    footer2.font = Font.systemFont(10)
    footer2.textColor = new Color('#00FFC3')
    
    const footer3 = footerStack.addText(' Validator')
    footer3.font = Font.systemFont(10)
    footer3.textColor = Color.gray()
    
    // Add flexible spacer after to balance
    footerContainer.addSpacer()

    return widget
}

module.exports = {
    version,
    supportedFamilies,
    createWidget
}


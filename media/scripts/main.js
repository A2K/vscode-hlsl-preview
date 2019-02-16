

let consolelog = console.log;
function log()
{
    var args = [];
    for(var i = 0; i < arguments.length; ++i) args.push(arguments[i]);
    consolelog((args.map(arg => {
        if (typeof(arg) === 'object') return JSON.stringify(arg);
        return arg;
    })).join(' '));
}
console.log = log;


const TypedArrayToPNG = (data, width, height, mime) =>
{
    mime = mime || "image/png";

    let canvas = $(`<canvas width=${width} height=${height}>`);
    canvas.css({
        display: 'none',
        width: `${width}px`,
        height: `${height}px`,
        position: 'fixed'
    });
    $('body').append(canvas);

    let ctx = canvas[0].getContext('2d');

    let imagedata = new ImageData(
        (data instanceof Uint8ClampedArray) ? data : new Uint8ClampedArray(data.buffer),
        width, height);


    ctx.putImageData(imagedata, 0, 0, 0, 0, width, height);

    let dataUrl;
    { // flip image vertically because OpenGL
        let mirrorCanvas = $(`<canvas width=${width} height=${height}>`);
        mirrorCanvas.css({
            display: 'none',
            width: `${width}px`,
            height: `${height}px`,
            position: 'fixed'
        });
        $('body').append(mirrorCanvas);

        let mirrorCtx = mirrorCanvas[0].getContext('2d');
        mirrorCtx.save();  // save the current canvas state
        mirrorCtx.setTransform(
            1, 0, // set the direction of x axis
            0, -1, // set the direction of y axis
            0, // set the x origin
            height // set the y origin
        );
        mirrorCtx.drawImage(canvas[0], 0, 0);
        mirrorCtx.restore(); // restore the state as it was when this function was called

        dataUrl = mirrorCanvas[0].toDataURL(mime, 1);

        mirrorCanvas.remove();
    }

    canvas.remove();

    return dataUrl;
}

const RenderToFile = (width, height, mimeType) =>
{
    width = width || 2048;
    height = height || 2048;
    mimeType = mimeType || 'image/png';

    let renderTarget = new THREE.WebGLRenderTarget(width, height, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        anisotropy: 0,
        encoding: THREE.LinearEncoding,
        depthBuffer: false,
        stencilBuffer: false
    });


    if (camera instanceof THREE.PerspectiveCamera)
    {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }

    if (shaderMode === ShaderModeMesh)
    {
        let size = renderer.getSize();
        renderer.setSize(width, height);

        let aspect = camera.aspect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.render(scene, camera, renderTarget, true);

        renderer.setSize(size.width, size.height);

        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }
    else
    {
        renderer.render(scene, camera, renderTarget, true);
    }

    return new Promise((resolve) =>
    {
        let buffer = new Uint8Array(width * height * 4);

        const check = ((renderTarget) =>
        {
            _gl.bindFramebuffer( _gl.FRAMEBUFFER, renderTarget.__webglFramebuffer );
            return _gl.checkFramebufferStatus( _gl.FRAMEBUFFER ) === _gl.FRAMEBUFFER_COMPLETE;
        }).bind(renderTarget);

        const finish = ((renderTarget, buffer, width, height, mimeType) =>
        {
            renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);
            let png = TypedArrayToPNG(buffer, width, height, mimeType);
            resolve(png);
        }).bind(this, renderTarget, buffer, width, height, mimeType);

        let checkAndFinish = (renderTarget, buffer, check, finish) =>
        {
            if (check)
            {
                return finish();
            }
            else
            {
                setTimeout(this, 15);
            }
        };

        checkAndFinish = checkAndFinish.bind(checkAndFinish, renderTarget, buffer, check, finish);

        checkAndFinish();
    });
}

const InternalParameters = [ 'iTime', 'iResolution' ];

var container;
var camera, scene, renderer;
var material, mesh;
var mouseX = 0, mouseY = 0,
lat = 0, lon = 0, phy = 0, theta = 0;
var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

var lastCameraPosition = new THREE.Vector3(-500, 0, 0);
var lastCameraRotation = new THREE.Euler();

var shaderMode = ShaderMode2D;

var CurrentGeometryClass = THREE.SphereGeometry;
var CurrentGeometrySubdivisions = 128;

scene = new THREE.Scene();

renderer = new THREE.WebGLRenderer({
    antialias: true,
    depth: true
});

$(renderer.domElement).click((event) =>
{
    if (!window.settings.hidden)
    {
        window.settings.toggleHidden(250);
    }
});

window.ifdefs = [];

window.startTime = Date.now();

window.maxZIndex = 100;

window.uniforms = {
    '_Globals': {
        value: {
            iTime: 0,
            iResolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        }
    }
}

window.TextureLoader = new THREE.TextureLoader();

const DefaultTextureSettings = {
    generateMipmaps: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
};

function updateMeshGeometry(subdivisions)
{
    if (!window.mesh) return;

    if (window.mesh.geometry) window.mesh.geometry.dispose();

    if (shaderMode === ShaderModeMesh)
    {

        window.mesh.geometry = new CurrentGeometryClass(100, subdivisions, subdivisions);
    }
}

function UpdateMaterial()
{
    if (!window.settings) {
        console.error('UpdateMaterial: window.settings not initialized');
        return;
    }

    let newUniforms = CreateUniformsFromDesc(window.uniformsDesc, window.texturesDesc, window.settings.uniformsValues);

    var recreateMaterial = false;

    Object.keys(newUniforms).forEach(key => {
        if (key === '_Globals') return;
        if ((!(key in window.uniforms)) || window.uniforms[key].value !== newUniforms[key].value) {
            window.uniforms[key] = newUniforms[key];
        }
    });

    Object.keys(window.uniforms).forEach(key =>
    {
        if (key in newUniforms)
        {
            if (key === '_Globals')
            {
                let Globals = window.uniforms['_Globals'];
                let newGlobals = newUniforms['_Globals'];
                Object.keys(newGlobals.value).forEach(((window, key) =>
                {
                    Globals.value[key] = newGlobals.value[key];
                }).bind(this, window));

                Object.keys(Globals.value).forEach(key =>
                {
                    if (InternalParameters.indexOf(key) >= 0)
                    {
                        return;
                    }
                    if (!(key in newGlobals.value))
                    {
                        delete Globals.value[key];
                    }
                });
            }
        }
        else
        {
            if (key !== '_Globals')
            {
                if (window.uniforms[key].type === 't')
                {
                    if (window.uniforms[key].value)
                    {
                        window.uniforms[key].value.dispose();
                    }
                }
                delete window.uniforms[key];
            }
        }
    });

    if (window.material)
    {
        if (window.material.fragmentShader !== window.fragmentShaderCode) {
            window.material.fragmentShader = '' + window.fragmentShaderCode;
            window.material.needsUpdate = true;
        }
        if (window.material.vertexShader !== window.vertexShaderCode) {
            window.material.vertexShader = '' + window.vertexShaderCode;
            window.material.needsUpdate = true;
        }
    } else {
        recreateMaterial = true;
    }
    if (recreateMaterial)
    {
        window.material = new THREE.ShaderMaterial({
            uniforms: window.uniforms,
            vertexShader: '' + window.vertexShaderCode,
            fragmentShader: '' + window.fragmentShaderCode
        });

        if (window.mesh) {
            window.mesh.material = material;
        }
    }
}

function LoadTexture(url, settings, filename) {

    if (typeof(settings) === 'undefined' || settings === null) {
        settings = DefaultTextureSettings;
    } else {
        Object.keys(DefaultTextureSettings).forEach(key => {
            if (!(key in settings)) {
                settings[key] = DefaultTextureSettings[key];
            }
        });
    }

    var texture;

    let errorCallback = (err) => {
        console.error('data url loading error: ' + err);
    }

    let ext = (filename.split('.') || ['']).pop().toLowerCase();

    switch (ext)
    {
        case 'tga':
            texture = new THREE.TGALoader().load(url, (q) => { if (window.material) window.material.needsUpdate = true; }, errorCallback);
        break;
        case 'dds':
            texture = new THREE.DDSLoader().load(url, (q) => { if (window.material) window.material.needsUpdate = true; }, errorCallback);
        break;
        default:
            texture = window.TextureLoader.load(url, (q) => { if (window.material) window.material.needsUpdate = true; }, errorCallback);
    }

    texture.flipY = false;

    if (filename) {
        texture.sourceFile = filename;
    }

    Object.assign(texture, settings);

    return texture;
}

window.fragmentShaderCode = "";
window.vertexShaderCode = "";
window.uniformsDesc = {};
window.texturesDesc = {};

var lastOpId = 0;

class FileOpener {

    constructor(vscode)
    {
        this.vscode = vscode;

        this.pendingOps = {};
    }

    open() {
        return new Promise(((resolve, reject) => {
            let opId = lastOpId++;
            this.pendingOps[opId] = {
                resolve: resolve,
                reject: reject,
                time: new Date().getTime()
            };
            this.vscode.postMessage({
                type: "openFile",
                data: {
                    opId: opId
                }
            });
        }).bind(this));
    }

    load(filename) {
        return new Promise(((resolve, reject) => {
            let opId = lastOpId++;
            this.pendingOps[opId] = {
                resolve: resolve,
                reject: reject,
                time: new Date().getTime()
            };
            this.vscode.postMessage({
                type: "loadFile",
                data: {
                    filename: filename,
                    opId: opId
                }
            });
        }).bind(this));
    }

    onFileResult(data) {

        let id = data.opId;

        if (!this.pendingOps[id]) {
            console.error('onOpenFile got unexpected op id: ' + id);
            return;
        }

        this.pendingOps[id].resolve(data);

        delete this.pendingOps[id];
    }

}

class TextureSettings {

    constructor(file, onUpdate, textureName, settings)
    {
        this.file = file;
        this.onUpdate = onUpdate;
        this.settings = settings;
        this.div = $('<div>');
        this.div.addClass('textureSettings');
        let header = $('<div>')
            .addClass('textureSettingsHeader')
            .html(`Texture settings: <span class="textureSettingsHeaderTextureName">${textureName}</span>`);

        header.on('mousedown', ((header, e) => {
            e = e || window.event;
            e.preventDefault();

            var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            pos3 = e.clientX;
            pos4 = e.clientY;

            let transitionOrigValue = this.div.css('transition');

            document.onmouseup = () => {
                this.div.css({
                    transition: transitionOrigValue,
                })
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = ((e) => {
                e = e || window.event;
                e.preventDefault();

                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;

                pos3 = e.clientX;
                pos4 = e.clientY;

                this.div.css({
                    transition: '0s',
                    marginLeft: `-=${pos1}`,
                    marginTop: `-=${pos2}`
                });
            }).bind(this);

            this.bringToTop();
        }).bind(this));

        let closeButton = $('<div>')
            .addClass('button')
            .html(`✖`)
            .on('click', (() => {
                this.close();
            }).bind(this));

        header.append(closeButton);

        this.div.append(header);
        this.div.append($('<div id="headerSpacer">'));
        this.table = this.createTextureSettingsTable();
        this.div.append(this.table);
        this.div.on('mousedown focus', this.bringToTop.bind(this));
    }

    close()
    {
        this.div.fadeOut({
            duration: 100,
            complete: () =>
            {
                this.div.detach();
                if (window.settings && window.settings.childWindows.contains(this))
                {
                    window.settings.childWindows.remove(this);
                }
            }
        });
    }

    bringToTop() {
        this.div.css({
            'z-index': window.maxZIndex++
        });
    }

    onSettingsUpdate() {

        this.settings = this.table.data('getSettings')()

        this.onUpdate();
    }

    getSettings() {
        return this.settings;
    }

    createTextureSettingsTable()
    {
        let onUpdate = this.onSettingsUpdate.bind(this);
        let updateEvents = 'change input keyup';

        let table = $('<table>')
            .addClass('textureSettingsTable');

        function makeFilterCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsFilterCell');

            let select = $('<select>')
                .append($(`<option value="nearest">`).text('Nearest'))
                .append($(`<option value="linear">`).text('Linear'));

            select.children().eq(settings.magFilter === THREE.NearestFilter ? 0 : 1).attr("selected", "selected")
            select.on(updateEvents, onUpdate);
            cell.append(select);

            cell.data('getSettings', (() => {
                const remapTable = {
                    nearest: THREE.NearestFilter,
                    linear: THREE.LinearFilter
                };
                let remap = (value) => {
                    return (value in remapTable) ? remapTable[value] : DefaultTextureSettings.magFilter;
                }
                let value = remap(select.children("option:selected").val())
                return {
                    minFilter: value,
                    magFilter: value
                };
            }));

            return cell;
        }

        function makeMipMapsCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsMipMapsCell')

            let table = $('<table>');

            table.addClass('textureSettingsInnerTable')

            let row1 = $('<tr>');

            row1.append($('<td>').append($('<label>').text("Enabled")));

            let checkbox = $('<input type="checkbox">');
            checkbox.attr('checked', settings.generateMipmaps ? true : false);
            checkbox.on(updateEvents, onUpdate);
            row1.append($('<td>').append(checkbox));

            table.append(row1);

            let row2 = $('<tr>');

            row2.append($('<td>').append($('<label>').text("Min filter")));

            let minFilterSelect = $('<select>')
                .append($('<option value="nearest">').text('Nearest'))
                .append($('<option value="linear">').text('Linear'));
            minFilterSelect.children().eq(
                ((settings.minFilter === THREE.NearestFilter) ||
                (settings.minFilter === THREE.NearestMipMapNearestFilter) ||
                (settings.minFilter === THREE.NearestMipMapLinearFilter)) ? 0 : 1).attr("selected", "selected")
            minFilterSelect.on(updateEvents, onUpdate);
            row2.append($('<td>').append(minFilterSelect));

            table.append(row2);

            cell.append(table);

            cell.data('getSettings', ((magFilter) => {
                const remapTable = {};

                remapTable[THREE.NearestFilter] = {
                    nearest: THREE.NearestMipMapNearestFilter,
                    linear: THREE.NearestMipMapLinearFilter
                };

                remapTable[THREE.LinearFilter] = {
                    nearest: THREE.LinearMipMapNearestFilter,
                    linear: THREE.LinearMipMapLinearFilter
                };

                let remap = (magFilter, value) => {
                    if (!(magFilter in remapTable)) magFilter = THREE.LinearFilter;
                    let subtable = remapTable[magFilter];
                    if (!(value in subtable)) {
                        return subtable.linear;
                    }
                    return remapTable[magFilter][value];
                }
                let data = {
                    generateMipmaps: checkbox.is(":checked")
                }
                if (data.generateMipmaps) {
                    data['minFilter'] = remap(magFilter, minFilterSelect.children("option:selected").val());
                };

                return data;
            }));

            return cell;
        }

        function makeWrappingCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsWrappingCell');

            let table = $('<table>');
            table.addClass('textureSettingsInnerTable')

            let row1 = $('<tr>');

            row1.append($('<td>').append($('<label>').text("Horizontal")));

            let selectH = $('<select>')
                .append($('<option value="clamp">').text('Clamp'))
                .append($('<option value="repeat">').text('Repeat'))
                .append($('<option value="mirror">').text('Mirror'));
            selectH.children().eq(
                ((settings.wrapS === THREE.MirroredRepeatWrapping) ? 2 : ((settings.wrapS === THREE.RepeatWrapping) ? 1 : 0))
            ).attr("selected", "selected")
            selectH.on(updateEvents, onUpdate);
            row1.append($('<td>').append(selectH));

            table.append(row1);

            let row2 = $('<tr>');
            row2.append($('<td>').append($('<label>').text("Vertical")));

            let selectV = $('<select>')
                .append($('<option value="clamp">').text('Clamp'))
                .append($('<option value="repeat">').text('Repeat'))
                .append($('<option value="mirror">').text('Mirror'));
            selectV.children().eq(
                ((settings.wrapT === THREE.MirroredRepeatWrapping) ? 2 : ((settings.wrapT === THREE.RepeatWrapping) ? 1 : 0))
            ).attr("selected", "selected")
            row2.append($('<td>').append(selectV));
            selectV.on(updateEvents, onUpdate);
            table.append(row2);

            cell.append(table);

            cell.data('getSettings', (() => {
                const remapTable = {
                    clamp: THREE.ClampToEdgeWrapping,
                    repeat: THREE.RepeatWrapping,
                    mirror: THREE.MirroredRepeatWrapping
                };
                let remap = (value) => {
                    return (value in remapTable) ? remapTable[value] : THREE.ClampToEdgeWrapping;
                }
                return {
                    wrapS: remap(selectH.children("option:selected").val()),
                    wrapT: remap(selectV.children("option:selected").val())
                };
            }));

            return cell;
        }

        let filterCell = makeFilterCell(this.settings);
        table.append($('<tr>')
            .append($('<td>').text('Filter'))
            .append(filterCell)
        );
        table.data('filterCell', filterCell);

        let mipMapsCell = makeMipMapsCell(this.settings);
        table.append($('<tr>')
            .append($('<td>').text('MipMaps'))
            .append(mipMapsCell)
        );
        table.data('mipMapsCell', mipMapsCell);

        let wrappingCell = makeWrappingCell(this.settings);
        table.append($('<tr>')
            .append($('<td>').text('Wrapping'))
            .append(wrappingCell)
        );
        table.data('wrappingCell', wrappingCell);

        table.data('getSettings', ((table) => {

            let filterCell = table.data('filterCell');
            let mipMapsCell = table.data('mipMapsCell');
            let wrappingCell = table.data('wrappingCell');

            let filterSettings = filterCell.data('getSettings')();
            let mipMapsSettings = mipMapsCell.data('getSettings')(filterSettings.magFilter);

            let wrappingSettings = wrappingCell.data('getSettings')();

            let result = Object.assign({}, filterSettings, mipMapsSettings, wrappingSettings);

            return result;
        }).bind(this, table))

        return table;
    }

    getActivationButton() {
        let button = $('<div>');
        button.addClass('textureSettingsActivationButton');

        button.text('🛠');

        button.on('click', event => {

            let animationOptions = {
                duration: 100,
                easing: 'linear'
            };

            if (0 === this.div.parent().length) {

                this.div.hide();
                this.div.css({
                    marginLeft: event.clientX - 20,
                    marginTop: event.clientY - 15
                });
                $('body').append(this.div);
                this.div.fadeIn(animationOptions);

            } else {
                this.div.animate({
                    marginLeft: event.clientX - 20,
                    marginTop: event.clientY - 15
                }, animationOptions);
            }

            this.bringToTop();

            window.settings.childWindows.add(this);
        });

        return button;
    }

}

class Settings
{
    constructor()
    {
        this.vscode = acquireVsCodeApi();
        this.fileOpener = new FileOpener(this.vscode);
        this.uniforms = {};
        this.uniformsValues = {};
        this.uniformsDesc = {};
        this.textureSettingsInstances = {};
        this.initialized = false;
        this.hidden = false;

        this._childWindows = new Set();
        this.childWindows = {
            add: ((item) =>
            {
                let result = this._childWindows.add(item);
                this.updateHoverState();
                return result;
            }).bind(this),
            remove: ((item) =>
            {
                if (this._childWindows.has(item))
                {
                    let result = this._childWindows.delete(item);
                    this.updateHoverState();
                    return result;
                }
            }).bind(this),
            contains: ((item) =>
            {
                return this._childWindows.has(item);
            }).bind(this)
        };

        if (!this.error) {
            this.error = this.makeErrorView();
            $('body').append(this.error);
            this.error.hide();
        }
    }

    postMessage(message)
    {
        this.vscode.postMessage(message);
    }

    updateHoverState()
    {
        if (this._childWindows.size > 0)
        {
            if (!this.div.hasClass('hover'))
            {
                this.div.addClass('hover');
            }
        }
         else
        {
            if (this.div.hasClass('hover'))
            {
                this.div.removeClass('hover');
            }
        }
    }

    requestData()
    {
        this.vscode.postMessage({
            type: 'update',
            data: {
                opId: lastOpId++
            }
        });

        this.vscode.postMessage({
            type: 'getUniforms',
            data: {
                opId: lastOpId++
            }
        });

        this.vscode.postMessage({
            type: 'getSettings',
            data: {
                opId: lastOpId++
            }
        });
    }

    init()
    {
        this.requestData();

        this.div = $('<div>');
        this.div.addClass('Settings');

        this.div.on('mousedown focus', this.bringToTop.bind(this));

        this.content = $('<div>');

        this.header = this.makeHeader();
        this.content.append(this.header);
        this.content.append($('<div>').addClass('settingsHeaderSpace'));

        this.modeSwitch = this.makeModeSwitch();
        this.content.append(this.modeSwitch);

        this.buttons = $('<div>').addClass('buttons');

        this.buttons.append(
            $('<div>')
            .addClass('button')
            .text('Recompile')
            .css({ cursor: 'pointer' })
            .on('click', () => {
                window.settings.postMessage({
                    type: 'update'
                });
            })
        );

        this.buttons.append(
            $('<div>')
            .addClass('button')
            .text('Render to file')
            .css({ cursor: 'pointer' })
            .on('click', () => {
                window.settings.postMessage({
                    type: 'selectSaveImage',
                    data: {}
                });
            })
        );

        this.content.append(this.buttons);

        // this.meshSettings = this.makeMeshSettings();
        // this.content.append(this.meshSettings);

        this.table = $('<div>');
        this.content.append(this.table);

        this.div.append(this.content);

        this.button = this.makeHideButton();
        this.div.append(this.button);
        if (!this.hidden)
        {
            this.button.hide();
        }

        $('body').append(this.div);

        this.initialized = true;

        this.updateUI();

        if (!WASMCompiler)
        {
            window.settings.vscode.postMessage({
                type: 'ready',
                data: { }
            });
        }
    }

    update(uniformsDesc)
    {
        this.uniformsDesc = uniformsDesc;
        this.updateUI();
    }

    updateUI()
    {
        if (!this.initialized) return;

        let div = this.div;

        if (this.modeSwitch)
        {
            this.modeSwitch.update();
        }

        if (this.uniformsDesc) {
            let table = this.buildTable(this.uniformsDesc);
            if (this.table) {
                this.table.replaceWith(table);
            } else {
                div.append(table);
            }
            this.table = table;
        }

        this.setErrorMessage(this.errorMessage);
    }

    makeHeader()
    {
        let header = $('<div>');
        header.addClass('settingsHeader');
        header.text('Settings');

        header.on('mousedown', ((e) => {
            e = e || window.event;
            e.preventDefault();

            var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            pos3 = e.clientX;
            pos4 = e.clientY;

            let startLeft = parseFloat(this.div.css('left')) || 0;
            let startTop = parseFloat(this.div.css('top')) || 0;

            let startX = e.clientX;
            let startY = e.clientY;
            let transitionOrigValue = this.div.css('transition');

            let cleanup = () =>
            {
                window.onmouseup = null;
                window.onmousemove = null;
                this.div.css({
                    transition: transitionOrigValue
                });
                this.vscode.postMessage({
                    type: 'updateSettings',
                    data: {
                        settings: {
                            position: {
                                left: this.div.css('left'),
                                top: this.div.css('top')
                            }
                        }
                    }
                });
            };

            window.onmouseup = (e) => {

                e.preventDefault();
                cleanup();
            };
            window.onmousemove = ((e) => {
                e = e || window.event;
                e.preventDefault();

                if (e.buttons !== 1)
                {
                    cleanup();
                    return;
                }

                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;

                pos3 = e.clientX;
                pos4 = e.clientY;

                let dx = e.clientX - startX;
                let dy = e.clientY - startY;

                this.div.css({
                    transition: '0s',
                    left: startLeft + dx,
                    top: startTop + dy
                });
            }).bind(this);

            this.bringToTop();
        }).bind(this));

        let closeButton = $('<div>')
            .addClass('button')
            .html(`✖`)
            .on('click', (() => {
                this.toggleHidden();
            }).bind(this));

        header.append(closeButton);

        return header;
    }

    bringToTop() {
        this.div.css({
            'z-index': window.maxZIndex++
        });
    }

    makeModeSwitch()
    {
        let div = $('<div>')
            .addClass('ModeSwitch');


        let label = $('<div>')
            .addClass('Label')
            .text('Mode:');
        div.append(label);


        let mode2d = $('<div>')
            .addClass('Mode')
            .append($('<div>')
                .addClass('Content')
                .text('2D'));

        div.append(mode2d);

        let modeMesh = $('<div>')
            .addClass('Mode')
            .append($('<div>')
                .addClass('Content')
                .text('◯'));

        let toggleMode = (mode) => {
            switch(mode) {
                case '2d':
                    SetShaderMode(ShaderMode2D);
                    if (modeMesh.hasClass('Active')) {
                        modeMesh.removeClass('Active');
                    }
                    if (!mode2d.hasClass('Active')) {
                        mode2d.addClass('Active');
                    }
                break;
                case 'mesh':
                    SetShaderMode(ShaderModeMesh);
                    if (!modeMesh.hasClass('Active')) {
                        modeMesh.addClass('Active');
                    }
                    if (mode2d.hasClass('Active')) {
                        mode2d.removeClass('Active');
                    }
                break;
            }
        }

        mode2d.bind('click', toggleMode.bind(this, '2d'));

        modeMesh.bind('click', toggleMode.bind(this, 'mesh'));

        div.append(modeMesh);

        if (shaderMode === ShaderMode2D)
        {
            mode2d.addClass('Active');
        }
        else if (shaderMode === ShaderModeMesh)
        {
            modeMesh.addClass('Active');
        }

        div.update = ((mode2d, modeMesh) =>
        {
            if (shaderMode === ShaderModeMesh)
            {
                if (mode2d.hasClass('Active'))
                {
                    mode2d.removeClass('Active');
                }
                if (!modeMesh.hasClass('Active'))
                {
                    modeMesh.addClass('Active');
                }
                if (this.meshSettings)
                {
                    this.meshSettings.show();
                }
            }
            else if (shaderMode === ShaderMode2D)
            {
                if (modeMesh.hasClass('Active'))
                {
                    modeMesh.removeClass('Active');
                }
                if (!mode2d.hasClass('Active'))
                {
                    mode2d.addClass('Active');
                }
                if (this.meshSettings)
                {
                    this.meshSettings.hide();
                }
            }
        }).bind(this, mode2d, modeMesh);

        return div;
    }

    makeMeshSettings()
    {
        let div = $('<div>');
        div.addClass('meshSettings');

        let subdivision = $('<div>');
        {
            let label = $('<div>');
            {
                label.text('Subdivisions:');
            }
            subdivision.append(label);

            let input = $('<input type="range" min="1" max="256" value="64">');
            {
                input.addClass('slider');

                input.on('change input keyup', ((input, event) => {
                    updateMeshGeometry(input.val());
                }).bind(this, input));
            }
            subdivision.append(input);
        }
        div.append(subdivision);

        return div;
    }

    formatErrorMessage(message, documentId)
    {
        let text = $('<div>');
        text.addClass('errorMesageContent');
        message.split('\n')
        .filter(line => {
            if (line.startsWith('SPIRV-Cross'))
            {
                return true;
            }
            let re = /^(.*):(\d+):(\d+): (warning|error): (.*)/;

            let match = re.exec(line);
            if (match) {
                return true;
            }
            return false;
        })
        .map((line => {
            let div = $('<div>');
            div.addClass('errorMessageLine');
            let parts = line.split(':');

            let re = /^(.*):(\d+):(\d+): (warning|error): (.*)/;

            let match = re.exec(line);
            if (match) {
                div.addClass('mainMessage');
                let filename = match[1];
                let line = parseInt(match[2]);
                let column = parseInt(match[3]);
                let level = match[4];
                let message = match[5];

                let location = $('<div>').addClass('errorLocation');
                div.append(
                    location
                    .append($('<div>').addClass('filename').text(filename))
                    .append($('<div>').addClass('line').text(line))
                    .append($('<div>').addClass('column').text(column))
                );

                location.on('click', ((event) => {
                    this.vscode.postMessage({
                        type: 'goto',
                        data: {
                            documentId: documentId,
                            filename: filename,
                            line: line,
                            column: column
                        }
                    })
                }).bind(this));

                div.append($('<div>').addClass('level').addClass(level).text(level));
                div.append($('<div>').addClass('message').text(message));

            } else {
                div.text(line);
            }

            return div;
        }).bind(this)).forEach(div => {
            text.append(div);
        });
        return text;
    }


    blinkFrame(color)
    {
        let frame = $('<div>')
            .addClass('errorFrameAnimation')
            .css({
                'box-shadow': `inset 0px 0px 50px 50px ${color}`,
                position: 'fixed',
                top: -25,
                left: -25,
                right: -25,
                bottom: -25,
                width: 'auto',
                height: 'auto',
                margin: 0,
                padding: 0,
                'z-index': window.maxZIndex++
            });

        frame.hide();

        $('body').append(frame);

        const blink = (durationIn, durationOut) => {
            return new Promise((resolve) => {
                frame.fadeIn(durationIn, () => {
                    frame.fadeOut(durationOut, () => resolve());
                });
            });
        };

        const blinkSequence = (durationIn, durationOut, times) =>
        {
            if (times === 0) {
                return new Promise((resolve) => resolve());
            }
            let promise = undefined;
            for(let i = 0; i < times; ++i)
            {
                if (promise) {
                    promise = promise.then(() => blink(durationIn, durationOut));
                } else {
                    promise = blink(durationIn, durationOut);
                }
            }
            return promise;
        }

        blinkSequence(50, 250, 1);
        /*
        blinkSequence(50, 250, 1).then(() => {
            frame.css({ opacity: 0.5 });
            blinkSequence(50, 150, 1);
        });
        */
    }

    setErrorMessage(error, documentId)
    {
        error = error || '';

        if (error && !this.errorMessage)
        {
            this.blinkFrame('rgba(255, 0, 0, 0.5)');
        }

        if (!error && this.errorMessage)
        {
            this.blinkFrame('rgba(0, 55, 255, 0.25)');
        }

        this.errorMessage = error;

        this.error.html('');

        let frame = $('#errorFrame');
        if (!error)
        {
            this.error.hide();

            if (!frame.hasClass('fixed'))
            {
                frame.addClass('fixed');
            }

            frame.fadeOut(250);
        }
        else
        {
            this.error.append(this.formatErrorMessage(error, documentId));
            this.error.show();
            if (frame.hasClass('fixed'))
            {
                frame.removeClass('fixed');
            }
            frame.fadeIn(250);
        }
    }

    makeErrorView() {
        var error = $('<div>')
            .addClass('errorMessage');
        error.hide();
        return error;
    }

    makeHideButton() {
        var button = $('<div id=hide>')
            .addClass('button');

        button.text('🛠');

        button.on('click', () => this.toggleHidden());

        return button;
    }

    toggleHidden(animationSpeed = 100)
    {
        let transitionOrigValue = this.div.css('transition');

        this.div.css('transition', '0s');

        if (this.hidden)
        {
            this.content.show(animationSpeed, () => {
                this.div.css('transition', transitionOrigValue);
            });

            if (this.div.hasClass('hidden'))  {
                this.div.removeClass('hidden');
            }

            this.div.unbind('click');
            this.button.hide(animationSpeed);
        }
        else
        {
            this.content.hide(animationSpeed, () => {
                this.div.css('transition', transitionOrigValue);
                this.div.bind('click', this.toggleHidden.bind(this, animationSpeed));
            });

            if (!this.div.hasClass('hidden'))  {
                this.div.addClass('hidden');
            }
            this.button.show(animationSpeed);
        }

        this.hidden = !this.hidden;

        this.vscode.postMessage({
            type: 'updateSettings',
            data: {
                settings: {
                    hidden: this.hidden
                }
            }
        });
    }

    buildIfdefField(ifdef)
    {
        let row = $('<tr>');
        let cell1 = $('<td>')
            .addClass('column1')
            .text(ifdef);

        let cell2 = $('<td>')
            .addClass('spacer')
            .text(" ");

        let cell3 = $('<td>')
            .addClass('column2');

        let checkbox = $(`<input type="checkbox" ${this.enabledIfdefs.indexOf(ifdef) < 0 ? '' : 'checked'}>`);
        checkbox.addClass('ifdefCheckbox');

        checkbox.data('ifdef', ifdef);
        checkbox.on('change input keyup', ((checkbox, ifdef, event) => {

            let checked = checkbox.is(":checked");

            let enabledIndex = this.enabledIfdefs.indexOf(ifdef);
            let enabled = enabledIndex >= 0;
            if (checked && !enabled) {
                this.enabledIfdefs.push(ifdef);
            }
            if (!checked && enabled) {
                this.enabledIfdefs.splice(enabledIndex, 1);
            }

            this.vscode.postMessage({
                type: "updateEnabledIfdefs",
                data: this.enabledIfdefs
            });

        }).bind(this, checkbox, ifdef));

        return row
            .append(cell1)
            .append(cell2)
            .append(cell3.append(checkbox));
    }

    buildTable(uniformsDesc) {

        let scrollBox = $('<div>');
        scrollBox.addClass('settingsScrollBox');

        var table = $('<table>')
            .addClass('settings');

        this.uniforms = {};

        window.ifdefs.forEach(ifdef => {
            let field = this.buildIfdefField(ifdef);
            table.append(field);
        });

        Object.keys(uniformsDesc).forEach(key => {
            let struct = uniformsDesc[key];
            var fields = {}
            Object.keys(struct).forEach(name => {
                let type = struct[name];
                let field = this.buildField(key, name, type);
                table.append(field);
                fields[name] = field;
            });
            this.uniforms[key] = fields;
        });

        Object.keys(texturesDesc).forEach(name => {
            let field = this.buildField(undefined, name, 't');
            table.append(field);
            this.uniforms[name] = field;
            this.uniforms[name].type = 't';
        });

        return scrollBox.append(table);
    }

    getTextureSettings(name, file, onUpdate, textureSettingsSettings)
    {
        var instance = this.textureSettingsInstances[name];

        if (!instance) {
            instance = new TextureSettings(file, onUpdate, name, textureSettingsSettings);
            this.textureSettingsInstances[name] = instance;
        }

        return instance;
    }

    getInputFieldForType(type, value, name, uniformKey)
    {
        let onUpdate = this.onSettingsUpdate.bind(this);

        var div = $('<div>')
            .addClass('inputBox');

        div.data('uniformKey', uniformKey);

        let makeFloatInput = (value) =>
        {
            value = parseFloat(value) || 0.0;

            let input = $(`<input type=number step=0.001 value=${value} pattern="^([-+]?\d*\.?\d+)(?:[eE]([-+]?\d+))?$">`);

            input.addClass('floatInput');

            var marker;

            input.on('mousedown', (event) =>
            {
                this._childWindows.forEach(w => {
                    if (w.isContextMenu)
                    {
                        w.remove();
                    }
                });
                var startValue = parseFloat(input.val());

                var mouseDownTime = new Date().getTime();

                var startPos = new THREE.Vector2(event.clientX, event.clientY);

                marker = $('<div>')
                .addClass('floatScrollMarker')
                .css({
                    left: (event.clientX - 50) + 'px',
                    top: (event.clientY - 50) + 'px',
                    'z-index': window.maxZIndex++,
                    opacity: 0,
                    cursor: 'default'
                });

                let text = $('<p>')
                .addClass('floatScrollMarkerText')
                .text('1.00x');

                marker.append(text);

                document.onmousemove = (event) =>
                {
                    marker.css({
                        left: (event.clientX - 50) + 'px',
                        top: (event.clientY - 50) + 'px',
                        opacity: 1,
                        cursor: 'w-resize'
                    });

                    if (new Date().getTime() - mouseDownTime < 200) {
                        return true;
                    }

                    let pos = new THREE.Vector2(event.clientX, event.clientY);

                    let speed = Math.exp(Math.max(1.0, Math.abs(startPos.y - pos.y)) * 0.01);

                    if (event.shiftKey) {
                        speed = 1.0 / Math.abs(speed);
                    }

                    if (speed > 0.01) {
                        text.text(`${speed.toFixed(2)}x`);
                    }
                    else
                    {
                        text.text(`${speed.toPrecision(4)}x`);
                    }

                    let delta = (pos.x - startPos.x) * speed;

                    input.val(startValue + delta * 0.01);
                    input.change();

                    event.preventDefault();
                    return false;
                };

                let cleanup = () => {
                    document.onmouseup = null;
                    document.onmousemove = null;
                    document.onkeypress = null;
                    document.oncontextmenu = null;
                    marker.remove();
                };

                document.onmouseup = cleanup;
                document.onkeypress = cleanup;
                document.oncontextmenu = () => {
                    input.val(startValue);
                    cleanup;
                }

                $('body').append(marker);

                return true;
            });
            return input;
        }

        function resize(arr, size) {
            if (typeof(arr) === 'undefined' || arr == null) arr = [];

            if ((arr instanceof THREE.Vector2) || (arr instanceof THREE.Vector3) || (arr instanceof THREE.Vector4)) {
                let jsarr = [];
                arr.toArray(jsarr);
                arr = jsarr;
            }

            if (!(arr instanceof Array)) {
                try {
                    arr = Array.from(arr);
                } catch(error) {
                    arr = [];
                }
            }

            arr = arr.map(e => parseFloat(e));

            var delta = arr.length - size;

            while (delta-- > 0) { arr.pop(); }
            while (delta++ < 0) { arr.push(0); }

            return arr;
        }

        switch(type)
        {
        case 'float':
        {
            div.addClass('floatInputBox');

            value = parseFloat(value) || 0.0;

            let field = makeFloatInput(value);

            field.on('change keyup', onUpdate);

            div.append(field);

            div.data("getValue", ((field) => parseFloat(field.val())).bind(this, field));
        }
        break;
        case 'vec2':
        {
            div.addClass('vectorInputBox');

            value = resize(value, 2);

            let x = makeFloatInput(value[0])
                .addClass('vectorInput2')
                .addClass('x')
                .on('change input keyup', onUpdate);
            div.append(x);

            let y = makeFloatInput(value[1])
                .addClass('vectorInput2')
                .addClass('y')
                .on('change input keyup', onUpdate);
            div.append(y);

            div.data("getValue", ((x, y) => [ x.val(), y.val() ].map(parseFloat)).bind(this, x, y));
        }
        break;
        case 'vec3':
        {
            value = resize(value, 3);

            div.addClass('vectorInputBox');

            let x = makeFloatInput(value[0])
                .addClass('vectorInput3')
                .addClass('x')
                .on('change input keyup', onUpdate);
            div.append(x);

            let y = makeFloatInput(value[1])
                .addClass('vectorInput3')
                .addClass('y')
                .on('change input keyup', onUpdate);
            div.append(y);

            let z = makeFloatInput(value[2])
                .addClass('vectorInput3')
                .addClass('z')
                .on('change input keyup', onUpdate);
            div.append(z);

            div.data('getValue', (() => [ x.val(), y.val(), z.val() ].map(parseFloat)).bind(this, x, y, z));
        }
        break;
        case 'vec4':
        {
            value = resize(value, 4);

            div.addClass('vectorInputBox');

            let x = makeFloatInput(value[0])
                .addClass('vectorInput4')
                .addClass('x')
                .on('change input keyup', onUpdate);
            div.append(x);

            let y = makeFloatInput(value[1])
                .addClass('vectorInput4')
                .addClass('y')
                .on('change input keyup', onUpdate);
            div.append(y);

            let z = makeFloatInput(value[2])
                .addClass('vectorInput4')
                .addClass('z')
                .on('change input keyup', onUpdate);
            div.append(z)

            let w = makeFloatInput(value[3])
                .addClass('vectorInput4')
                .addClass('w')
                .on('change input keyup', onUpdate);
            div.append(w);

            div.data('getValue', (() => [ x.val(), y.val(), z.val(), w.val() ].map(parseFloat)).bind(this, x, y, z, w));
        }
        break;
        case 't':
        {
            let table = $('<table>');
            let row = $('<tr>');
            let cell1 = $('<td>');
            let cell2 = $('<td>');


            let file = $(`<input type=file hidden>`)
                .addClass('textureInput');


            let textureSettingsSettings = value ? (value.settings ? value.settings : DefaultTextureSettings) : DefaultTextureSettings;
            let textureSettings = this.getTextureSettings(name, file, onUpdate, textureSettingsSettings);

            div.data('textureSettings', textureSettings);
            cell1.append(textureSettings.getActivationButton());

            if (value) {
                if (value.filename) {
                    file.data('filename', value.filename);
                }

                if (value.value) {
                    file.data('texture', value.value);
                } else if (value.filename) {
                    this.fileOpener.load(value.filename).then(((file, filename, onUpdate, data) => {
                        let dataUri = data.data;
                        let texture = LoadTexture(dataUri, textureSettings.getSettings(), filename);
                        value.value = texture;
                        file.data('texture', texture);
                        if (file.data('onFileSelected')) file.data('onFileSelected')(filename);
                        onUpdate();
                    }).bind(this, file, value.filename, onUpdate));
                }
            }

            function getBaseName(path) {
                return path.split(/[/\\]/).pop();
            }

            {
                let display = $('<div>');
                display.addClass('displayFileInput');

                let displayOpen = $('<div>');
                displayOpen.addClass('displayOpen');
                displayOpen.text('🗁');
                display.append(displayOpen);

                let displayFilename = $('<div>');
                displayFilename.addClass('displayFilename');
                if (value.filename) {
                    displayFilename.text(getBaseName(value.filename));
                }
                file.data('onFileSelected', ((displayFilename, filename) => {
                    displayFilename.text(getBaseName(filename));
                }).bind(this, displayFilename));
                display.append(displayFilename);

                display.on('click', ((onUpdate, file, e) => {
                    this.fileOpener.open().then(((onUpdate, file, data) => {
                        file.data('filename', data.filename);
                        file.data('texture', LoadTexture(data.data, textureSettings.getSettings(), data.filename));
                        if (file.data('onFileSelected')) file.data('onFileSelected')(data.filename);
                        onUpdate();
                    }).bind(this, onUpdate, file));
                }).bind(this, onUpdate, file));

                cell2.append(display);
            }

            cell2.append(file);

            div.data('getValue', ((file, div) => {
                return {
                    texture: file.data('texture'),
                    filename: file.data('filename'),
                    settings: div.data('textureSettings').getSettings()
                };
            }).bind(this, file, div));

            div.append(table.append(row.append(cell1).append(cell2)));
        }
        break;
        }

        div.on('contextmenu', ((div, onUpdate, event) =>
        {
            let value = div.data('getValue')();
            switch (value.length)
            {
                case 2:
                    value = new THREE.Vector2(value[0], value[1]);
                break;
                case 3:
                    value = new THREE.Vector3(value[0], value[1], value[2]);
                break;
                case 4:
                    value = new THREE.Vector4(value[0], value[1], value[2], value[3]);
                break;
            }

            const serialize = (value, type) =>
            {
                let COLOR = [ 'R', 'G', 'B', 'A' ];
                let VECTOR = [ 'X', 'Y', 'Z', 'W' ];
                let V = type === 'color' ? COLOR : VECTOR;
                if (value instanceof THREE.Vector4)
                {
                    return `(${V[0]}=${value.x},${V[1]}=${value.y},${V[2]}=${value.z},${V[3]}=${value.w})`;
                }
                else if (value instanceof THREE.Vector3)
                {
                    return `(${V[0]}=${value.x},${V[1]}=${value.y},${V[2]}=${value.z})`;
                }
                else if (value instanceof THREE.Vector2)
                {
                    return `(${V[0]}=${value.x},${V[1]}=${value.y})`;
                }
                return value + '';
            };

            const deserialize = (data) =>
            {
                const re4 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+),[BZ]=([-+]?[0-9]*\.?[0-9]+),[AW]=([-+]?[0-9]*\.?[0-9]+)\)/;
                const re3 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+),[BZ]=([-+]?[0-9]*\.?[0-9]+)\)/;
                const re2 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+)\)/;
                const re1 = /[-+]?[0-9]*\.?[0-9]+/;

                const res = [ re4, re3, re2, re1 ];
                const types = [ THREE.Vector4, THREE.Vector3, THREE.Vector2, 'float' ];

                const run_res = () =>
                {
                    for(let i = 0; i < res.length; ++i)
                    {
                        let re = res[i];

                        var m = re.exec(data);
                        if (m)
                        {
                            let type = types[i];
                            if (typeof(type) !== 'function')
                            {
                                if (m.length === 1)
                                {
                                    return m[0]
                                }
                                else
                                {
                                    return m.slice(1).map(parseFloat);
                                }
                            }
                            else
                            {
                                m = m.slice(1).map(parseFloat);
                                m.unshift(this);
                                return new (Function.prototype.bind.apply(type, m));
                            }
                        }
                    }
                }

                let match = run_res();
                return match;
            };

            const copyToClipboard = str => {
                const el = document.createElement('textarea');
                el.value = str;
                el.setAttribute('readonly', '');
                el.style.position = 'absolute';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            };

            const getClipboardText = () =>
            {
                const el = document.createElement('textarea');
                el.value = '';
                el.style.position = 'absolute';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.select();
                document.execCommand("paste");
                let value = el.value;
                document.body.removeChild(el);
                return value;
            };

            const makeContextMenu = ((value, div, onUpdate) =>
            {
                let menu = $('<div>');
                menu.addClass('contextMenu');

                if (value.length === 1)
                {
                    let copy = $('<div>');
                    copy.addClass('contextMenuItem');
                    copy.text('Copy');
                    copy.on('click', ((value) =>
                    {
                        menu.remove();
                        this.childWindows.remove(menu);
                        let data = serialize(value);
                        copyToClipboard(data);
                    }).bind(this, value));
                    menu.append(copy);
                } else {
                    let copyAsVector = $('<div>');
                    copyAsVector.addClass('contextMenuItem');
                    copyAsVector.text('Copy as vector');
                    copyAsVector.on('click', ((value) =>
                    {
                        menu.remove();
                        this.childWindows.remove(menu);
                        let data = serialize(value, 'vector');
                        copyToClipboard(data);
                    }).bind(this, value));
                    menu.append(copyAsVector);

                    let copyAsColor = $('<div>');
                    copyAsColor.addClass('contextMenuItem');
                    copyAsColor.text('Copy as color');
                    copyAsColor.on('click', ((value) =>
                    {
                        menu.remove();
                        this.childWindows.remove(menu);
                        let data = serialize(value, 'color');
                        copyToClipboard(data);
                    }).bind(this, value));
                    menu.append(copyAsColor);
                }

                let paste = $('<div>');
                paste.addClass('contextMenuItem');
                paste.text('Paste');
                paste.on('click', ((value, div, onUpdate) =>
                {
                    menu.remove();
                    this.childWindows.remove(menu);
                    let data = getClipboardText();
                    data = deserialize(data);
                    div.data('getValue', ((data) => { return data; }).bind(this, data));
                    this.onSettingsUpdate();
                    this.updateUI();
                }).bind(this, value, div, onUpdate));
                menu.append(paste);


                let clear = $('<div>');
                clear.addClass('contextMenuItem');
                clear.text('Clear');
                clear.on('click', ((value, div, onUpdate) =>
                {
                    menu.remove();
                    this.childWindows.remove(menu);
                    let data = [ 0 ] * value.length || 0;
                    div.data('getValue', ((data) => { return data; }).bind(this, data));
                    this.onSettingsUpdate();
                    this.updateUI();
                }).bind(this, value, div, onUpdate));
                menu.append(clear);

                menu.isContextMenu = true;

                return menu;
            }).bind(this, value, div, onUpdate);

            let menu = makeContextMenu();

            menu.css({
                'z-index': window.maxZIndex++,
                marginLeft: event.clientX,
                marginTop: event.clientY
            });

            $('body').append(menu);
            this.childWindows.add(menu);

            $(window).click(((menu) =>
            {
                menu.remove();
                this.childWindows.remove(menu);
            }).bind(this, menu));

        }).bind(this, div, onUpdate));

        return div;
    }

    buildUniforms()
    {
        var result = {};

        Object.keys(this.uniforms).forEach(key =>
        {
            let struct = this.uniforms[key];

            if (struct['type'] === 't')
            {
                var data = struct.data('getValue')();
                //if (data.texture) data.texture = Object.assign(data.texture, data.settings);
                result[key] = { type: 't', value: data.texture, settings: data.settings, filename: data.filename };
            }
            else
            {
                var fields = {};
                Object.keys(struct).forEach(name => {
                    let value = struct[name].data('getValue')();
                    fields[name] = value;
                });
                result[key] = fields;
            }
        });

        this.uniformsValues = result;
    }

    setUniformsValues(values)
    {
        this.uniformsValues = values;
        this.updateUI();
    }

    setEnabledIfdefs(enabledIfdefs)
    {
        this.enabledIfdefs = enabledIfdefs;
        this.updateUI();
    }

    onSettingsUpdate()
    {

        this.buildUniforms();

        var serializedUniforms = {};
        Object.keys(this.uniformsValues).forEach(key => {
            if (this.uniformsValues[key]['type'] === 't') {
                serializedUniforms[key] = {
                    type: 't',
                    filename: this.uniformsValues[key]['filename'],
                    settings: this.uniformsValues[key]['settings']
                };
            } else {
                serializedUniforms[key] = this.uniformsValues[key];
            }
        });

        this.vscode.postMessage({
            type: "updateUniforms",
            data: serializedUniforms
        });

        UpdateMaterial();
    }

    buildField(key, name, type)
    {
        let uniformKey = key ? [ key, name ] : [ name ];

        let value = 0;

        if (key)
        {
            if (this.uniformsValues[key] && this.uniformsValues[key][name])
            {
                value = this.uniformsValues[key][name];
            }
        }
        else if (type === 't')
        {
            if (this.uniformsValues)
            {
                if (name in this.uniformsValues)
                {
                    value = this.uniformsValues[name];
                }
            }
        }

        var field = this.getInputFieldForType(type, value, name, uniformKey);
        var row = $('<tr>')
            .addClass('settingsRow')
            .append(
                $('<td>')
                .addClass('column1')
                .text(name)
            ).append(
                $('<td>')
                .addClass('spacer')
                .text(" ")
            ).append(
                $('<td>')
                .addClass('column2')
                .append(field)
            );

        row.data('getValue', () => field.data('getValue')());

        row.data('uniformKey', field.data('uniformKey'));

        return row;
    }

}

window.settings = new Settings();



function CreateUniformsFromDesc(uniformsDesc, texturesDesc, values)
{
    var newUniforms = {};

    let GetInitForType = function(key, name, type) {

        let value = (values && (key in values)) ? values[key][name] : undefined;

        switch(type)
        {
            case 'float':
                return parseFloat(value) || 0.0;
                break;
            case 'vec2':
                if (value) {
                    return new THREE.Vector2(value[0], value[1]);
                }
                return new THREE.Vector2(0, 0);
                break;
            case 'vec3':
                if (value) {
                    return new THREE.Vector3(value[0], value[1], value[2]);
                }
                return new THREE.Vector3(0, 0, 0);
                break;
            case 'vec4':
                if (value) {
                    return new THREE.Vector4(value[0], value[1], value[2], value[3]);
                }
                return new THREE.Vector4(0, 0, 0, 0);
                break;
        }
        return undefined;
    }

    Object.keys(uniformsDesc).forEach(key => {
        let struct = uniformsDesc[key];
        var fields = {};
        Object.keys(struct).forEach(name => {
            let type = struct[name];
            let obj = GetInitForType(key, name, type);
            fields[name] = obj;
        });
        newUniforms[key] = { value: fields };
    });

    Object.keys(texturesDesc).forEach(tex => {

        var textureValue = undefined;

        if (values && tex in values)
        {
            var data = values[tex];
            if (data && data.value)
            {
                textureValue = data.value;

                if (data.settings)
                {
                    Object.assign(textureValue, data.settings);
                    if (textureValue.image)
                    {
                        textureValue.needsUpdate = true;
                    }
                }
            }
        }

        if (textureValue) {
            newUniforms[`SPIRV_Cross_Combined${tex}${tex}Sampler`] = { type: 't', value: textureValue };
        }
    });

    return newUniforms;
}

window.addEventListener("message", event =>
{
    switch(event.data.command)
    {
        case 'saveImage':
        {
            let data = event.data.data;
            RenderToFile(data.width, data.height, data.mimeType)
            .then(dataUrl =>
            {
                window.settings.postMessage({
                    type: 'saveImage',
                    data: {
                        mimeType: data.mimeType,
                        path: data.path,
                        width: data.width,
                        height: data.height,
                        image: dataUrl
                    }
                })
            });
        }
        break;
        case 'compileShader':
        {
            if (!window.wasm)
            {
                console.error("received request to compile a shader but don't have WASM enabled");
                break;
            }
            let data = event.data.data;
            let handleResponse = (result) =>
            {
                window.settings.vscode.postMessage({
                    type: 'shader',
                    data: {
                        version: data.version,
                        documentId: data.documentId,
                        success: result.success,
                        error: result.error,
                        reflection: result.reflection,
                        glsl: result.glsl,
                        metadata: data.metadata
                    }
                });
            };
            window.wasm.compile(data.code, data).then(handleResponse, handleResponse);
        }
        break;
        case 'updateFragmentShader':
            window.fragmentShaderCode = event.data.data.code;
            window.uniformsDesc = event.data.data.uniforms;
            if (event.data.data.textures instanceof Object)
            {
                window.texturesDesc = event.data.data.textures;
            }

            if (window.settings)
            {
                window.settings.update(window.uniformsDesc);
            }
            UpdateMaterial();
        break;
        case 'updateVertexShader':
            vertexShaderCode = event.data.data.code;
            window.uniformsDesc = event.data.data.uniforms;
            if (window.settings)
            {
                window.settings.update(window.uniformsDesc);
            }
            UpdateMaterial();
        break;
        case 'showErrorMessage':
            if (window.settings)
            {
                window.settings.setErrorMessage(event.data.data.message, event.data.data.documentId);
            }
        break;
        case 'loadUniforms':
            if (window.settings)
            {
                var deserialized = {};

                window.settings.setUniformsValues(event.data.data.uniforms);

                if (window.mesh)
                {
                    UpdateMaterial();
                }
                else
                {
                    console.log('no mesh created yet');
                }
            }
            else
            {
                console.error('window.settings not initialized yet');
            }
        break;
        case 'updateIfdefs':
            window.ifdefs = event.data.data.ifdefs;
            window.settings.setEnabledIfdefs(event.data.data.enabledIfdefs);
        break;
        case 'openFile':
            window.settings.fileOpener.onFileResult(event.data.data);
        break;
        case 'loadFile':
            window.settings.fileOpener.onFileResult(event.data.data);
        break;
        case 'settings':
            processSettings(event.data.data);
        break;
        default:
            console.error('UNKNOWN MESSAGE RECEIVED: ' + JSON.stringify(event));
    }
});

function processSettings(settings)
{
    if ('shaderMode' in settings)
    {
        switch(settings.shaderMode)
        {
            case 'mesh':
                SetShaderMode(ShaderModeMesh);
            break;
            case '2d':
                SetShaderMode(ShaderMode2D);
            break;
        }
    }
    if ('camera' in settings)
    {
        lastCameraPosition.set(settings.camera.position.x, settings.camera.position.y, settings.camera.position.z);
        lastCameraRotation.set(settings.camera.rotation._x, settings.camera.rotation._y, settings.camera.rotation._z, settings.camera.rotation._order);

        if (shaderMode == ShaderModeMesh)
        {
            camera.position.copy(lastCameraPosition);
            camera.rotation.copy(lastCameraRotation);
        }
    }
    if ('settings' in settings)
    {
        if ('hidden' in settings.settings)
        {
            if (settings.settings.hidden !== window.settings.hidden)
            {
                window.settings.toggleHidden(10);
            }
        }
        if ('position' in settings.settings)
        {
            window.settings.div.css(settings.settings.position);
            let left = parseFloat(settings.settings.position.left) || 5;
            let top = parseFloat(settings.settings.position.top) || 5;
            if (left < -0) left = 5;
            if (top < -0) top = 5;

            if (left > window.innerWidth - 125) left = window.innerWidth - window.settings.div.width()*2;
            if (top > window.innerHeight - 125) top = window.innerHeight - window.settings.div.height() * 2;

            window.settings.div.css('left', left);
            window.settings.div.css('top', top);
        }
    }
}

function ShaderMode2D()
{
    camera = new THREE.Camera();

    camera.position.set(-1, 0, 0);

    if (window.vertexShaderCode === document.getElementById( 'vertexShaderMesh' ).textContent)
    {
        window.vertexShaderCode = document.getElementById( 'vertexShader' ).textContent;
    }

    window.mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), window.material );

    delete scene.background;

    if (window.settings && window.settings.vscode)
    {
        window.settings.vscode.postMessage({
            type: "updateSettings",
            data: {
                shaderMode: '2d'
            }
        });
    }
}

function ShaderModeMesh()
{
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

    camera.position.copy(lastCameraPosition);

    if (window.vertexShaderCode === document.getElementById( 'vertexShader' ).textContent)
    {
        window.vertexShaderCode = document.getElementById( 'vertexShaderMesh' ).textContent;
    }

    window.mesh = new THREE.Mesh(new CurrentGeometryClass(100, CurrentGeometrySubdivisions, CurrentGeometrySubdivisions), window.material);

    if (scene)
    {
        scene.background = new THREE.CubeTextureLoader()
            .setPath(document.getElementById('skyboxPath').textContent)
            .load([
                'posx.jpg',
                'negx.jpg',
                'posy.jpg',
                'negy.jpg',
                'posz.jpg',
                'negz.jpg'
            ]);

        scene.background.generateMipmaps = true;
    }

    if (window.settings && window.settings.vscode)
    {
        window.settings.vscode.postMessage({
            type: "updateSettings",
            data: {
                shaderMode: 'mesh'
            }
        });
    }

}

function SetShaderMode(func)
{
    if (window.mesh)
    {
        scene.remove(window.mesh);
    }

    func();

    window.shaderMode = func;

    camera.lookAt(new THREE.Vector3(0,0,0));

    if (scene)
    {
        scene.add(window.mesh);
    }

    if (func == ShaderModeMesh)
    {
        controls = new THREE.OrbitControls( camera, renderer.domElement );

        //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.25;

        controls.rotateSpeed = 0.5;

        controls.enablePan = false;
        controls.screenSpacePanning = false;

        controls.minDistance = 75;
        controls.maxDistance = 1000;

        //controls.maxPolarAngle = Math.PI / 2;
        controls.target = new THREE.Vector3(0, 0, 0);
    }
    else
    {
        if (typeof(controls) !== 'undefined')
        {
            controls.enabled = false;
            controls.dispose();
            delete controls;
        }
    }

    UpdateMaterial();

    window.settings.updateUI();
}

function init()
{
    container = document.getElementById( 'content' );

    SetShaderMode(shaderMode);

    UpdateMaterial();

    container.appendChild( renderer.domElement );

    renderer.setSize( window.innerWidth, window.innerHeight );

    $(window).resize(() =>
    {
        if (camera instanceof THREE.PerspectiveCamera)
        {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }

        renderer.setSize( window.innerWidth, window.innerHeight );
    });
}

function animate()
{
    requestAnimationFrame( animate );
    if (typeof(controls) !== 'undefined') controls.update();
    render();
}

function render()
{
    var elapsedMilliseconds = Date.now() - window.startTime;
    var elapsedSeconds = elapsedMilliseconds / 1000.;
    window.shaderTime = 60. * elapsedSeconds;

    window.uniforms['_Globals'].value.iTime = window.shaderTime;
    window.uniforms['_Globals'].value.iResolution.set(window.innerWidth, window.innerHeight);

    renderer.render(scene, camera);

    camera.position.onChange
    if (shaderMode === ShaderModeMesh)
    {
        if ((lastCameraPosition.distanceTo(camera.position) > 0.1))
        {
            lastCameraPosition.copy(camera.position);
            lastCameraRotation.copy(camera.rotation);

            window.settings.vscode.postMessage({
                type: 'updateSettings',
                data: {
                    camera: {
                        position: lastCameraPosition,
                        rotation: lastCameraRotation
                    }
                }
            });
        }
    }
}

$(document).ready(() =>
{
    if (WASMCompiler)
    {
         window.wasm = new WASMCompiler();
         window.wasm.onRuntimeInitialized = () => {
            window.settings.vscode.postMessage({
                type: 'ready',
                data: { }
            });
            window.settings.requestData();
         }
    }

    if (!window.vertexShaderCode)
    {
        window.vertexShaderCode = document.getElementById( 'vertexShader' ).textContent;
    }

    if (!window.fragmentShaderCode)
    {
        window.fragmentShaderCode = document.getElementById( 'fragmentShader' ).textContent;
    }

    window.settings.init();

    if (window.uniformsDesc)
    {
        window.settings.update(window.uniformsDesc);
    }

    init();

    animate();

    var waiting = 2;

    window.onerror = (msg, url, line, col, error) =>
    {
        // Note that col & error are new to the HTML 5 spec and may not be
        // supported in every browser.  It worked for me in Chrome.
        let extra = !col ? '' : '\ncolumn: ' + col;
        extra += !error ? '' : '\nerror: ' + error;

        // You can view the information in an alert to see things working like this:
        console.log("Error: " + msg + "\nurl: " + url + "\nline: " + line + extra);

        // TODO: Report this error via ajax so you can keep track
        //       of what pages have JS issues

        let suppressErrorAlert = false;
        // If you return true, then error alerts (like in older versions of
        // Internet Explorer) will be suppressed.
        return suppressErrorAlert;
     };
});


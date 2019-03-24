'strict';

window.events = new EventEmitter();

window.mouse = new MouseListener();

const EmptyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);

const DefaultTextureSettings = {
    generateMipmaps: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
};

window.communicator = new Communicator();
window.events.on('postMessage', ((communicator, event) => {
    communicator.postMessage(event.data.type, event.data.data);
}).bind(this, communicator));

window.messageProcessor = new MessageProcessor();
window.messageProcessor.register(window.communicator);

window.fileOpener = new FileOpener((type, data) =>
    window.communicator.postMessage(type, data)
);

window.communicator.on('message.openFile message.loadFile', event =>
{
    let c = {};
    Object.assign(c, event.data);
    c.data = `${c.data.length} bytes`;
    window.fileOpener.onFileResult(event.data);
});

window.shaderReactor = new ShaderReactor();
window.messageProcessor.setShaderReactor(window.shaderReactor);

window.shaderReactor.on('update.buffer.name', (event =>
{
    let shader = event.data.shader;
    window.communicator.postMessage('setBufferName', {
        documentId: shader.documentId,
        bufferName: shader.bufferName
    });
    this.lastUpdateTime = Date.now();
}).bind(this));

window.shaderReactor.on('update.*.ifdefs', event =>
{
    let shader = window.shaderReactor.getShader(event.data.documentId);
    if (!shader) return;

    window.communicator.postMessage('updateEnabledIfdefs', {
        documentId: shader.documentId,
        ifdefs: shader.ifdefs.getEnabledIfdefNames()
    });
});

window.shaderReactor.on('update.*.uniforms', event =>
{
    let shader = window.shaderReactor.getShader(event.data.documentId);
    if (!shader) return;

    window.communicator.postMessage('updateUniforms', {
        documentId: shader.documentId,
        uniforms: window.shaderReactor.getSerializedUniforms(shader.documentId)
    });
});

var errorMessage = $('<div>').addClass('errorMessage');
$('#errorFrame').append(errorMessage);
window.shaderReactor.on('update.*.error', event =>
{
    errorMessage.html('');
    let haveErrors = false;
    Object.keys(window.shaderReactor.shaders).forEach(key => {
        let shader = window.shaderReactor.shaders[key];
        if (typeof(shader.errorMessage) === 'string' && shader.errorMessage.trim().length > 0) {
            haveErrors = true;
            SettingsWindow.formatErrorMessage(shader.errorMessage, shader.documentId, errorMessage);
        }
    });

    if (haveErrors)
    {
        let seen = {};
        errorMessage.children().each(function()
        {
            let txt = $(this).html();
            if (seen[txt])
            {
                $(this).remove();
            }
            else
            {
                seen[txt] = true;
            }
        });
        $('#errorFrame').show();
    }
    else
    {
        $('#errorFrame').hide();
    }
});


const GetPixelsValues = (positions) =>
{
    let width = renderer.getSize().width;
    let height = renderer.getSize().height;

    return new Promise((resolve) =>
    {
        RenderToTypedArray(width, height).then(buffer =>
        {
            resolve(positions.map(pos => {
                const x = pos.x || pos[0];
                const y = pos.y || pos[1];
                const index = ((height - y) * width + x) * 4;
                const p = buffer.slice(index, index + 4);
                return new THREE.Vector4(p[0], p[1], p[2], p[3]);
            }));
        });
    });
};

const GetPixelValue = (x, y) =>
{
    return GetPixelsValues([{x: x, y: y}]).then(v => {
        return v[0];
    });
};

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
};

const RenderToTypedArray = (width, height) =>
{
    width = width || 2048;
    height = height || 2048;

    let renderer = window.renderer.renderer;

    let scene = window.renderer.scene;

    let camera = window.renderer.scene.camera;

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

    if (window.render.scene instanceof PreviewScene3D)
    {
        let size = renderer.getSize();
        renderer.setSize(width, height);

        let aspect = camera.aspect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        window.renderer.scene.onBeforeRender(window.renderer.renderer);

        renderer.render(scene, camera, renderTarget, true);

        renderer.setSize(size.width, size.height);

        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }
    else
    {

        window.renderer.scene.onBeforeRender(window.renderer.renderer);

        window.renderer.updateUniforms(window.renderer.scene.uniforms);
        renderer.render(scene, camera, renderTarget, true);

        window.renderer.scene.onAfterRender(window.renderer.renderer);
    }

    return new Promise((resolve) =>
    {
        let buffer = new Uint8Array(width * height * 4);

        const check = ((renderTarget) =>
        {
            _gl.bindFramebuffer( _gl.FRAMEBUFFER, renderTarget.__webglFramebuffer );
            return _gl.checkFramebufferStatus( _gl.FRAMEBUFFER ) === _gl.FRAMEBUFFER_COMPLETE;
        }).bind(renderTarget);

        const finish = ((renderTarget, buffer, width, height) =>
        {
            renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);
            resolve(buffer);
        }).bind(this, renderTarget, buffer, width, height);

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
};

const RenderToFile = (width, height, mimeType) =>
{
    mimeType = mimeType || 'image/png';

    return new Promise((resolve) =>
    {
        RenderToTypedArray(width, height, mimeType).then((
        (resolve, width, height, mimeType, buffer) =>
        {
            let png = TypedArrayToPNG(buffer, width, height, mimeType);
            resolve(png);
        }).bind(this, resolve, width, height, mimeType));
    });
};


var container;
var camera, scene, renderer;
var material, mesh;
var mouseX = 0, mouseY = 0,
lat = 0, lon = 0, phy = 0, theta = 0;
var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

$(document).click((event) =>
{
    /*
    console.log('CLICK:', event);
    console.log('CLICK:',
        event.target === $('body'),
        event.target === $(document),
        event.target === $(renderer.renderer.domElement));
        console.log($(event.target).prop("tagName"));
        console.log();

    const getElementInfo = (element) =>
    {
        return {
            tag: $(event.target).prop("tagName"),
            id: $(event.target).prop("id"),
            classes: ($(event.target).attr('class') || '').split(/\s+/)
        };
    };

    let p = $(event.target).parents('.SettingsWindow');

    console.log(`got ${p.length} parents`);

    for(let i = 0; i < p.length; ++i)
    {
        console.log(`parent ${i}:`, $(getElementInfo(p[i])));
    }

    console.log('PARENTS:', p, Object.keys(p), $.inArray(window.settings, p));
    */

    if (!$(event.target).parents('.AbstractWindow').length)
    {
        if (!window.settings.hidden)
        {
            if (window.settings.subwindows.length === 0)
            {
                // window.settings.toggleHidden(250);
            }
        }
    }
});

window.startTime = Date.now();

window.TextureLoader = new THREE.TextureLoader();

function LoadTexture(url, settings, filename, callback, errorCallback) {

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

    errorCallback = errorCallback || ((err) => {
        console.error('data url loading error: ' + err);
    });

    let ext = (filename.split('.') || ['']).pop().toLowerCase();

    callback = callback || (() =>
    {
        console.log("TEXTURE LOADED:", url);
    });

    switch (ext)
    {
        case 'tga':
            texture = new THREE.TGALoader().load(url, callback, undefined, errorCallback);
        break;
        case 'dds':
            texture = new THREE.DDSLoader().load(url, callback, undefined, errorCallback);
        break;
        default:
            texture = window.TextureLoader.load(url, callback, undefined, errorCallback);
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

function processSettings(settings)
{
    if ('shaderMode' in settings)
    {
        window.events.emit('setShaderMode', { mode: settings.shaderMode });
        switch(settings.shaderMode)
        {
            // TODO
            // case 'mesh':
            //     SetShaderMode(ShaderModeMesh);
            // break;
            // case '2d':
            //     SetShaderMode(ShaderMode2D);
            // break;
        }
    }
    if ('camera' in settings)
    {
        // TODO
        // lastCameraPosition.set(settings.camera.position.x, settings.camera.position.y, settings.camera.position.z);
        // lastCameraRotation.set(settings.camera.rotation._x, settings.camera.rotation._y, settings.camera.rotation._z, settings.camera.rotation._order);

        // if (shaderMode == ShaderModeMesh)
        // {
        //     camera.position.copy(lastCameraPosition);
        //     camera.rotation.copy(lastCameraRotation);
        // }
    }
    if ('settings' in settings)
    {
        if ('hidden' in settings.settings)
        {
            if (settings.settings.hidden !== window.settings.hidden)
            {
                window.settings.toggleHidden(0);
            }
        }
        if ('position' in settings.settings)
        {
            window.settings.domElement.css(settings.settings.position);
            let left = parseFloat(settings.settings.position.left) || 5;
            let top = parseFloat(settings.settings.position.top) || 5;
            if (left < -0) left = 5;
            if (top < -0) top = 5;

            if (left > window.innerWidth - 125) left = window.innerWidth - window.settings.domElement.width()*2;
            if (top > window.innerHeight - 125) top = window.innerHeight - window.settings.domElement.height() * 2;

            window.settings.domElement.css('left', left);
            window.settings.domElement.css('top', top);
        }
    }
}

var fps = $('<div>').addClass('FPS');
$('body').append(fps);

var lastRenderTime = 0;

var lastFrameTimes = [];
var NumAvgFps = 128;

function animate()
{
    requestAnimationFrame( animate );

    let renderTime = Date.now();

    if (typeof(controls) !== 'undefined') controls.update();

    window.windowManager.renderTree();

    renderer.render();

    let frameTime = renderTime - lastRenderTime;

    lastFrameTimes.push(frameTime);

    let avgFrameTime = lastFrameTimes.reduce((a, b) => a + b, 0) / lastFrameTimes.length;
    let avgFps = Math.ceil(1000 / avgFrameTime);

    while(lastFrameTimes.length > NumAvgFps)
    {
        lastFrameTimes.shift();
    }

    fps.text(avgFps);

    let scale = Math.min(avgFps / 60.0, 1);
    fps.css({ color: `rgb(${255 * (1.0 - scale)}, ${255 * scale}, 125)` });

    lastRenderTime = renderTime;
}

$(document).ready(() =>
{
    window.renderer = new PreviewRenderer($('#content'), window.shaderReactor);

    window.windowManager = new WindowManager($('body'));

    window.settings = new SettingsWindow(window.windowManager, window.shaderReactor);
    window.windowManager.addWindow(window.settings);

    if (WASMCompiler)
    {
         window.wasm = new WASMCompiler();
         window.wasm.onRuntimeInitialized = () => {
            window.communicator.postMessage('ready');
            window.communicator.postMessage('update');
         };
    }
    else
    {
        window.communicator.postMessage('ready');
        window.communicator.postMessage('update');
    }

    animate();

    /*
    $(renderer.domElement).on('mousemove', (event) =>
    {
    GetPixelValue(event.clientX, event.clientY).then(value =>
    {
        console.log(`pixel (${event.clientX}, ${event.clientY}): ${value}`);

        console.log(value.x, value.y, value.z, value.w);
    });
    });
    */
});


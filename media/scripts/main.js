function log()
{
    var args = [];
    for(var i =0; i < arguments.length; ++i) args.push(arguments[i]);
    console.log((args.map(arg => {
        if (typeof(arg) === 'object') return JSON.stringify(arg);
        return arg;        
    })).join(' '));
}

const InternalParameters = [ 'iTime', 'iResolution' ];

var container;
var camera, scene, renderer;
var material, mesh;
var mouseX = 0, mouseY = 0,
lat = 0, lon = 0, phy = 0, theta = 0;
var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

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
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
};

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
        window.uniforms[key] = newUniforms[key];
    });
    
    Object.keys(window.uniforms).forEach(key => {
        if (key === '_Globals') return;
        if (!(key in newUniforms)) {
            delete window.uniforms[key];
        }
    });

    if ('_Globals' in window.uniforms)
    {
        if ('_Globals' in newUniforms) {

            Object.keys(newUniforms['_Globals'].value).forEach(((window, key) => {
                window.uniforms['_Globals'].value[key] = newUniforms['_Globals'].value[key];
            }).bind(this, window));
        }
    
        Object.keys(window.uniforms['_Globals'].value).forEach(key => {
            if (InternalParameters.indexOf(key) >= 0) return; 
            if (!(key in newUniforms['_Globals'].value)) {
                delete window.uniforms['_Globals'].value[key];
            }
        });
    }
    
    if (window.material) 
    {
        if ((window.material.fragmentShader !== window.fragmentShaderCode) 
            || (window.material.vertexShader !== window.vertexShaderCode))
        {
            recreateMaterial = true;
        }
    } else {
        recreateMaterial = true;
    }
    if (recreateMaterial) 
    {
        window.material = new THREE.ShaderMaterial({
            uniforms: window.uniforms,
            vertexShader: window.vertexShaderCode,
            fragmentShader: window.fragmentShaderCode
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

    let texture = window.TextureLoader.load(url, (q) => {}, (err) => {
        console.error('data url loading error: ' + err);
    });

    if (filename) {
        texture.sourceFile = filename;
    }

    Object.assign(texture, settings);

    return texture;
}

const DefaultTexture = LoadTexture($('#defaultTexture').attr('src'), DefaultTextureSettings);

window.fragmentShaderCode = "";
window.vertexShaderCode = "";
window.uniformsDesc = {};
window.texturesDesc = {};


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

            document.onmouseup = () => {
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
                this.div.detach();
            }).bind(this));

        header.append(closeButton);

        this.div.append(header);
        this.div.append($('<div id="headerSpacer">'));
        this.table = this.createTextureSettingsTable();
        this.div.append(this.table);
        this.div.on('mousedown focus', this.bringToTop.bind(this));
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
            $('body').append(this.div);
            // TODO: position div to click event
        })

        return button;
    }

}


class Settings {


    constructor() {

        this.vscode = acquireVsCodeApi();

        this.uniforms = {};
        this.uniformsValues = {};
        this.uniformsDesc = {};
        this.textureSettingsInstances = {};
        this.initialized = false;
        this.hidden = false;

        if (!this.button) {
            this.button = this.makeHideButton();
        }

        if (!this.error) {
            this.error = this.makeErrorView();
            $('body').append(this.error);
            this.error.hide();
        }

    }

    init()
    {
        this.div = $('<div id=settings>');
        $('body').append(this.div);

        this.initialized = true;

        this.updateUI();

        this.toggleHidden();
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

        if (this.uniformsDesc) {
            let table = this.buildTable(uniformsDesc);
            if (this.hidden) {
                table.hide();
            }
            if (this.table) {
                this.table.replaceWith(table);
            } else {
                div.append(table);
            }
            this.table = table;
        }

        if (!this.button) {
            this.button = this.makeHideButton();
        }

        div.append(this.button);

        this.setErrorMessage(this.errorMessage);
       
    }

    setErrorMessage(error) {
        
        this.errorMessage = error;

        if (!error) {
            this.error.hide();
            this.error.setText('');
            return;
        } 

        this.error.setText(error);
        this.error.show();
    }

    makeErrorView() {
        var error = $('<div>')
            .addClass('errorMessage');

        error.setText = ((error, text) => {
            error.text(text);
        }).bind(this, error);

        return error;
    }

    makeHideButton() {
        var button = $('<div id=hide>')
            .addClass('button');

        if (this.hidden) {
            button.text('🛠');
        } else {
            button.text('Hide 🛠');
        }
            
        return button;
    }

    toggleHidden() {

        if (this.hidden) {
            this.div.children().eq(0).show(100, event => {
                this.button.bind('click', this.toggleHidden.bind(this));
            });

            if (this.div.hasClass('hidden'))  {
                this.div.removeClass('hidden');
            }

            this.button.text('Hide 🛠');
            
            this.div.unbind('click');
        } else {
            this.div.children().eq(0).hide(100, event => {
                this.div.bind('click', this.toggleHidden.bind(this));
            });

            if (!this.div.hasClass('hidden'))  {
                this.div.addClass('hidden');
            }

            this.button.text('🛠');

            this.button.unbind('click');
        }
        
        this.hidden = !this.hidden;
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

        Object.keys(texturesDesc).forEach(tex => {
            let field = this.buildField(undefined, tex, 't');
            table.append(field);
            this.uniforms[tex] = field;
            this.uniforms[tex].type = 't';
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

    getInputFieldForType(type, value, name) {
        
        let onUpdate = this.onSettingsUpdate.bind(this);

        var div = $('<div>')
            .addClass('inputBox');

        function makeFloatInput(value) {
            value = parseFloat(value) || 0.0;
            let input = $(`<input type=number step=0.001 value=${value} pattern="^([-+]?\d*\.?\d+)(?:[eE]([-+]?\d+))?$">`);
            return input;
        }

        function resize(arr, size) {
            if (typeof(arr) === 'undefined' || arr == null) arr = [];
            if (!arr.isArray || !arr.isArray()) {
                try {
                    arr = Arrys.from(arr);
                } catch(error) {
                    arr = [];
                }
            } else {
                arr = Arrys.from(arr);
            }
            var delta = arr.length - size;
        
            while (delta-- > 0) { arr.pop(); }
            while (delta++ < 0) { arr.push(0); }

            return arr;
        }

        if (0 === type.localeCompare("float")) {

            value = value || 0.0;

            var value = makeFloatInput(value)
                .addClass('floatInput')
                .on('change keyup', onUpdate);

            div.append(value);

            div.data("getValue", (() => value.val()).bind(this, value));
        }

        if (0 === type.localeCompare("vec2")) {
            div.addClass('vectorInputBox');

            value = resize(value, 2);

            var x = makeFloatInput(value[0])
                .addClass('vectorInput2')
                .addClass('x')
                .on('change input keyup', onUpdate);
            div.append(x);

            var y = makeFloatInput(value[1])
                .addClass('vectorInput2')
                .addClass('y')
                .on('change input keyup', onUpdate);
            div.append(y);
            
            div.data("getValue", ((x, y) => [ x.val(), y.val() ]).bind(this, x, y));
        }
        
        if (0 === type.localeCompare("vec3")) {

            value = resize(value, 3);

            div.addClass('vectorInputBox');

            var x = makeFloatInput(value[0])
                .addClass('vectorInput3')
                .addClass('x')
                .on('change input keyup', onUpdate);
            div.append(x);

            var y = makeFloatInput(value[1])
                .addClass('vectorInput3')
                .addClass('y')
                .on('change input keyup', onUpdate);
            div.append(y);

            var z = makeFloatInput(value[2])
                .addClass('vectorInput3')
                .addClass('z')
                .on('change input keyup', onUpdate);
            div.append(z);

            div.data('getValue', (() => [ x.val(), y.val(), z.val() ]).bind(this, x, y, z));
        }

        if (0 === type.localeCompare("vec4")) {

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

            div.data('getValue', (() => [ x.val(), y.val(), z.val(), w.val() ]).bind(this, x, y, z, w));
        }

        if (0 === type.localeCompare('t')) {

            let table = $('<table>');
            let row = $('<tr>');
            let cell1 = $('<td>');
            let cell2 = $('<td>');

            
            let file = $(`<input type=file hidden>`)
                .addClass('textureInput');
            
            if (value) {
                if (value.data) {            
                    file.data('textureData', value.data);        

                    if (value.texture) {
                        file.data('texture', value.texture);
                    } else {
                        file.data('texture', LoadTexture(value.data, value.settings));
                    }
                    if (value.filename) {
                        file.data('filename', value.filename);
                        file.attr('value', value.filename);
                    }
                }
            }

            file.on('change input keyup', ((file, onUpdate, settings) => {
                if (!file[0].files) { return undefined; }

                var fileObject = file[0].files[0];

                file.data('filename', fileObject.name);

                var fr = new FileReader();
                
                fr.onload = ((fr, onUpdate, settings) => {                    
                    file.fileDataURL = fr.result;                    
                    file.data('textureData', fr.result);
                    file.data('texture', LoadTexture(fr.result, settings, fileObject.name));
                    if (file.data('onFileSelected')) file.data('onFileSelected')(fileObject.name);
                    onUpdate();        
                }).bind(this, fr, onUpdate, settings);

                fr.readAsDataURL(fileObject);
            }).bind(this, file, onUpdate, value.settings));

            
            let textureSettingsSettings = value ? (value.settings ? value.settings : DefaultTextureSettings) : DefaultTextureSettings;
            let textureSettings = this.getTextureSettings(name, file, onUpdate, textureSettingsSettings);
            
            div.data('textureSettings', textureSettings);
            cell1.append(textureSettings.getActivationButton());
            
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
                    displayFilename.text(value.filename);
                }
                file.data('onFileSelected', ((displayFilename, filename) => {
                    displayFilename.text(filename);
                }).bind(this, displayFilename));
                display.append(displayFilename);

                display.on('click', ((file, e) => {
                    file.click();
                }).bind(this, file));

                cell2.append(display);
            }

            cell2.append(file);
            
            div.data('getValue', ((file, div) => {
                return { 
                    texture: file.data('texture'), 
                    data: file.data('textureData'), 
                    filename: file.data('filename'),
                    settings: div.data('textureSettings').getSettings()
                };
            }).bind(this, file, div));

            div.append(table.append(row.append(cell1).append(cell2)));
        }

        return div;
    }

    buildUniforms() {
        var result = {};

        Object.keys(this.uniforms).forEach(key => {
            let struct = this.uniforms[key];

            if (struct['type'] === 't')
            {
                var data = struct.data('getValue')();
                //if (data.texture) data.texture = Object.assign(data.texture, data.settings);
                result[key] = { type: 't', value: data.texture, data: data.data, settings: data.settings, filename: data.filename };
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

    setUniformsValues(values) {
        this.uniformsValues = values;
        this.updateUI();
    }

    setEnabledIfdefs(enabledIfdefs) {
        this.enabledIfdefs = enabledIfdefs;
        this.updateUI();
    }

    onSettingsUpdate() {
        this.buildUniforms();
        
        var serializedUniforms = {};
        Object.keys(this.uniformsValues).forEach(key => {
            if (this.uniformsValues[key]['type'] === 't') {
                serializedUniforms[key] = { 
                    type: 't',
                    data: this.uniformsValues[key]['data'], 
                    filename: this.uniformsValues[key]['filename'],
                    settings: this.uniformsValues[key]['settings']
                };
            } else {
                serializedUniforms[key] = this.uniformsValues[key];
            }
        })

        this.vscode.postMessage({
            type: "updateUniforms",
            data: serializedUniforms
        });

        UpdateMaterial(this.uniformsValues);
    }

    buildField(key, name, type) {
        let value = 0;
        
        if (key) {
            if (this.uniformsValues[key] && this.uniformsValues[key][name]) {
                value = this.uniformsValues[key][name];
            }
        } else if (type === 't') {
            if (this.uniformsValues) {

                if (name in this.uniformsValues) {
                    value = this.uniformsValues[name];
                }
            }
        }

        var field = this.getInputFieldForType(type, value, name);
        var row = $('<tr>')
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

        row.data('getValue', field.data('getValue'));

        return row;
    }

}

window.settings = new Settings();


function CreateUniformsFromDesc(uniformsDesc, texturesDesc, values)
{    
    var newUniforms = {};

    let GetInitForType = function(key, name, type) {
        
        let value = (values && (key in values)) ? values[key][name] : undefined;

        if (0 === type.localeCompare('float')) {
            return value || 0.0;
        } else if (0 === type.localeCompare('vec2')) {
            if (value) {
                return new THREE.Vector2(value[0], value[1]);
            }
            return new THREE.Vector2(0, 0);
        } else if (0 === type.localeCompare('vec3')) {
            if (value) {
                return new THREE.Vector3(value[0], value[1], value[2]);
            }
            return new THREE.Vector3(0, 0, 0);
        } else if (0 === type.localeCompare('vec4')) {
            if (value) {
                return new THREE.Vector4(value[0], value[1], value[2], value[3]);
            }
            return new THREE.Vector4(0, 0, 0, 0);
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

        if (values && tex in values) {
            var data = values[tex];
            if (data) {                
                textureValue = data ? (data.value ? data.value : DefaultTexture) : DefaultTexture;

                if (data.settings) {
                    Object.assign(textureValue, data.settings);
                    if (textureValue.image) {
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

window.addEventListener("message", event => {
    
    if (0 === event.data.command.localeCompare('updateFragmentShader'))
    {
        window.fragmentShaderCode = event.data.data.code;
        window.uniformsDesc = event.data.data.uniforms;
        window.texturesDesc = event.data.data.textures;
        
        UpdateMaterial();

        if (window.settings) {
            window.settings.update(window.uniformsDesc);
        }
    }
    else if (0 === event.data.command.localeCompare('updateVertexShader'))
    {      
        vertexShaderCode = event.data.data.code;

        UpdateMaterial();
    }
    else if (0 === event.data.command.localeCompare('showErrorMessage'))
    {
        if (window.settings) {
            window.settings.setErrorMessage(event.data.data);        
        }
    }
    else if (0 === event.data.command.localeCompare('loadUniforms'))
    {
        if (window.settings) {
            var deserialized = {};
            
            Object.keys(event.data.data).forEach(key => {
                let field = event.data.data[key];

                if (field['type'] === 't') {
                    deserialized[key] = {
                        type: 't',
                        value: LoadTexture(field.data, field.settings),
                        data: field.data,
                        settings: field.settings,
                        filename: field.filename
                    };
                    
                } else {
                    deserialized[key] = field;
                }
            });
            window.settings.setUniformsValues(deserialized);

            if (window.mesh) {
                UpdateMaterial();
            } else {
                console.log('no mesh created yet');
            }
        } else {
            console.error('window.settings not initialized yet');
        }
    }
    else if (0 === event.data.command.localeCompare('updateIfdefs'))
    {
        window.ifdefs = event.data.data.ifdefs;
        window.settings.setEnabledIfdefs(event.data.data.enabledIfdefs);
    }
});

function init() {
    container = document.getElementById( 'content' );
    camera = new THREE.Camera();
    camera.position.z = 1;
    scene = new THREE.Scene();

    UpdateMaterial();
    
    window.mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), window.material );
    scene.add( window.mesh );
    
    renderer = new THREE.WebGLRenderer();
    container.appendChild( renderer.domElement );
    
    renderer.setSize( window.innerWidth, window.innerHeight );
   
    $(window).resize(function() {
        renderer.setSize( window.innerWidth, window.innerHeight );
    });
}

function animate() 
{
    requestAnimationFrame( animate );
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
}

$(document).ready(() => 
{
    if (!window.vertexShaderCode) {
        window.vertexShaderCode = document.getElementById( 'vertexShader' ).textContent;
    }
    
    if (!window.fragmentShaderCode) {
        window.fragmentShaderCode = document.getElementById( 'fragmentShader' ).textContent;
    }
    
    window.settings.init();

    if (window.uniformsDesc) {
        window.settings.update(window.uniformsDesc);
    }
    
    init();
    
    animate();
});

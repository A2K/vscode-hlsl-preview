
class WASMCompiler {
    constructor() {
        this.isRuntimeInitialized = false;

        this.DefaultOptions = {
            filename: 'test.hlsl',
            entryPoint: 'main',
            profile: 'ps_6_4',
            args: ["-Od", "-Ges", "-spirv", "-fspv-reflect", "-fspv-target-env=vulkan1.1"],
            reflect: true,
            defines: ['VSCODE_HLSL_PREVIEW']
        };

        this.waiting = 2;

        this.showLoadingIndicator(500);

        let count = () => {
            if (--this.waiting <= 0) {
                console.log(`WASM runtime initialized`);
                this.isRuntimeInitialized = true;
                if (typeof (this.onRuntimeInitialized) === 'function') {
                    this.onRuntimeInitialized();
                }
                this.hideLoadingIndicator(250);
            }
        };

        (this.spirv = window.SPIRV()).onRuntimeInitialized = (() => {
            console.log(`SPIRV ${this.spirv} runtime initialized`);
            count();
        }).bind(this);

        (this.dxc = window.DXC()).onRuntimeInitialized = (() => {
            console.log(`DXC ${this.dxc} runtime initialized`);
            count();
        }).bind(this);
    }

    createLoadingIndicator() {
        let indicator = $('<div>');
        indicator.addClass('loadingIndicator');
        indicator.append($('<div>').addClass('background'));
        indicator.append($('<div>').text('Loading HLSL compiler').addClass('text'));
        return indicator;
    }

    showLoadingIndicator(duration) {
        if (!this.loadingIndicator) {
            this.loadingIndicator = this.createLoadingIndicator();
            $('body').append(this.loadingIndicator);
            this.loadingIndicator.hide();
        }

        this.loadingIndicator.fadeIn(duration);
    }

    hideLoadingIndicator(duration) {
        if (this.loadingIndicator) {
            this.loadingIndicator.fadeOut(duration);
        }
    }

    dumpAST(content, options) {
        options.args = options.args || [];
        if (options.args.indexOf('-ast-dump') < 0)
        {
            options.args.push('-ast-dump');
        }

        if (this.lastPromise) {
            return (this.lastPromise = this.lastPromise.then(
                () => this.executeDXC(content, options),
                () => this.executeDXC(content, options)
            ));
        }
        else {
            return (this.lastPromise = this.executeDXC(content, options));
        }
    }

    executeDXC(content, options) {
        if (!this.isRuntimeInitialized) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.doCompile(content, options).then(resolve, reject);
                }, 250);
            });
        }
        return new Promise((resolve, reject) => {
            options = options || {};
            options.reflect = options.reflect || false;
            options.entryPoint = options.entryPoint || "main";
            if (options.code) {
                delete options.code;
            }

            options.defines = options.defines || this.DefaultOptions.defines;
            this.DefaultOptions.defines.forEach(define => {
                if (options.defines.indexOf(define) < 0) {
                    options.defines.push(define);
                }
            });

            try {
                let compileResult = this.dxc.Compile(content, options);

                if (compileResult.success)
                {
                    resolve(compileResult);
                }
                else
                {
                    reject(compileResult);
                }
            }
            catch (e) {
                reject({ success: false, error: e });
            }
        });
    }

    compile(content, options) {
        if (this.lastPromise) {
            return (this.lastPromise = this.lastPromise.then(
                () => this.doCompile(content, options),
                () => this.doCompile(content, options)
            ));
        }
        else {
            return (this.lastPromise = this.doCompile(content, options));
        }
    }

    doCompile(content, options) {
        if (!this.isRuntimeInitialized) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.doCompile(content, options).then(resolve, reject);
                }, 250);
            });
        }

        options = options || {};
        options.reflect = options.reflect || false;
        options.entryPoint = options.entryPoint || "main";
        if (options.code) {
            delete options.code;
        }

        options.args = options.args || this.DefaultOptions.args;
        this.DefaultOptions.args.forEach(arg => {
            if (options.args.indexOf(arg) < 0) {
                options.args.push(arg);
            }
        });

        return new Promise((resolve, reject) =>
        {
            this.executeDXC(content, options).then((result) => {
                var spirvBytecode = result.data;

                var ptr = this.spirv._malloc(spirvBytecode.length);
                var array = new Uint8Array(this.spirv.HEAPU8.buffer, ptr, spirvBytecode.length);
                array.set(spirvBytecode);

                let res;
                try
                {
                    res = this.spirv.SPIRVtoGLSL(spirvBytecode, { reflect: options.reflect });
                }
                catch (e)
                {
                    console.log("SPIRV EXCEPTION:", e);
                    result.success = false;
                    result.error = e;
                    reject(result);
                    return;
                }
                finally
                {
                    this.spirv._free(ptr);
                }

                if (!res.success) {
                    console.error('failed to compile to GLSL: ' + res.error);
                    result.success = false;
                    result.error = res.error;
                    reject(result);
                }
                else {
                    result.success = true;
                    result.glsl = res.glsl;
                    if (res.reflection) {
                        result.reflection = JSON.parse(res.reflection);
                    }
                    resolve(result);
                }
            }, (reason) => {
                reject(reason);
            });
        });
    }

}

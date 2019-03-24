import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

import GLSLCode from './GLSLCode';
import ShaderDocument from './ShaderDocument';
import HLSLtoGLSLRecompiler from './HLSLtoGLSLRecompiler';
import ThrottledDelayer from './ThrottledDelayer';
import { ShaderType, RunTrigger } from './Enums';
import { GetWebviewContent } from './WebViewContent';

import * as Utils from './Utils';
import * as WebUtils from './WebView/WebUtils';
import HLSLCompiler from './HLSLCompiler';

import * as Base64 from 'base64-js';
import WASMWebServer from './WASMWebServer';
import SyntaxTreeParser from './SyntaxTreeParser';


// TODO: switch to buffer/shader when assigned

export default class HLSLPreview
{
	private panel: vscode.WebviewPanel | undefined = undefined;

    private documents: { [key:string]: ShaderDocument } = { };

    private makeDocumentsKey(shaderDocument: ShaderDocument): string
    {
        if (shaderDocument.shaderType === ShaderType.buffer)
        {
            return shaderDocument.bufferName || '';
        }

        return ShaderType.GetShaderTypeName(shaderDocument.shaderType);
    }

	private triggerSubscribed: RunTrigger | undefined = undefined;

	private context: vscode.ExtensionContext;

	private recompiler = new HLSLtoGLSLRecompiler();

	private trigger = RunTrigger.onType;

    private _lastShaderDocumentIndex: number = 0;

    private delay: number = 250;

    private useNativeBinaries: boolean = true;

    private panelReady: boolean = false;

    private wasmWebServer: WASMWebServer | undefined;

    private useWASMWebServer: boolean = true;

    private retainContextWhenHidden: boolean = true;

    private updateWASMWebServer()
    {
        let isRunning: boolean = typeof(this.wasmWebServer) !== 'undefined' && this.wasmWebServer !== null;

        let shouldBeRunning:boolean = (!this.useNativeBinaries) && this.useWASMWebServer;

        if (this.wasmWebServer && isRunning && !shouldBeRunning)
        {
            this.wasmWebServer.dispose();
            delete this.wasmWebServer;
        }
        else if (!isRunning && shouldBeRunning)
        {
            this.wasmWebServer = new WASMWebServer(this.context);
        }
    }

    private GetNextDocumentIndex(): number
    {
        return this._lastShaderDocumentIndex++;
    }

    constructor(context: vscode.ExtensionContext)
    {
        this.context = context;
        this.loadConfiguration();
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.trigger = RunTrigger.from(section.get<string>('preview.trigger', RunTrigger.strings.onType));
            this.delay = section.get<number>('preview.delay', this.delay);
            this.useNativeBinaries = section.get<boolean>('preview.useNativeBinaries', true);
            this.useWASMWebServer = section.get<boolean>('preview.useWebServer', true);
            this.retainContextWhenHidden = section.get<boolean>('preview.retainContextWhenHidden', true);
        }

        this.recompiler.loadConfiguration();

        if (this.useNativeBinaries)
        {
            this.recompiler.canUseNativeBinaries().then(((canUseNativeBinaries: boolean) =>
            {
                if (!canUseNativeBinaries)
                {
                    console.error("native binaries not available");
                    this.useNativeBinaries = false;
                }

                this.updateWASMWebServer();

                if (this.panel)
                {
                    this.updateWebviewContent();
                }

            }).bind(this));
        }
        else
        {
            this.updateWASMWebServer();

            if (this.panel)
            {
                this.updateWebviewContent();
            }
        }
    }

    public updateWebviewContent()
    {
        if (!this.panel)
        {
            return;
        }

        if (this.useWASMWebServer && this.wasmWebServer)
        {
            this.wasmWebServer.getPort().then(port =>
            {
                if (this.panel)
                {
                    let content = GetWebviewContent(this.context, this.useNativeBinaries, true, port);
                    this.panel.webview.html = content;
                }
            });
        }
        else
        {
            let content = GetWebviewContent(this.context, this.useNativeBinaries, false, 0);
            this.panel.webview.html = content;
        }
    }

    public onStartCommand()
    {
        if (!vscode.window.activeTextEditor)
        {
			console.error('no active text editor');
			return;
		}

        if (!vscode.window.activeTextEditor.document)
        {
			console.error('no active document');
			return;
		}

		let doc = vscode.window.activeTextEditor.document;

		this.PreviewDocument(doc);
    }


    public onPreprocessCommand()
    {
        this.generateAndCopyCode(false);
    }

    public onPreprocessSelectCommand()
    {
        this.generateAndCopyCode(true);
    }

    private async generateAndCopyCode(forceSelectEntryPoint:boolean = false)
    {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let document = editor.document;
        if (!document) { return; }

        let doc = new ShaderDocument(this.context, this.GetNextDocumentIndex(), editor.document, ShaderType.pixel);
        doc.includeDirs = this.recompiler.GetIncludeDirectories(doc);

        let res = await this.recompiler.PreprocessHLSL(doc);

        await this.handlePreprocessedCode(doc, res.ReadDataSync(), forceSelectEntryPoint);

        vscode.window.showInformationMessage('Copied generated code to clipboard', { modal: false });
    }

    private messageListeners: {
        [key: string]: ({
            resolve: (data?: any | PromiseLike<any> | undefined) => any,
            reject: (reason?: any) => void,
            responseId: number
        })[]
    } = {};

    private async ReceiveMessage(type: string, responseId: number)
    {
        let promise = new Promise<any>((r, j) => {
            let obj = {resolve: r, reject: j, responseId: responseId };
            if (!(type in this.messageListeners))
            {
                this.messageListeners[type] = [ obj ];
            }
            else
            {
                this.messageListeners[type].push(obj);
            }
        });

        return promise;
    }

    private MessageReceivedBroadcast(type: string, responseId: number, message: object)
    {
        if (type in this.messageListeners)
        {
            this.messageListeners[type].forEach(listener => {
                if (listener.responseId === responseId)
                {
                    listener.resolve(message);
                }
            });
        }
    }

    private lastOpId: number = 0;

    private getNextOpId()
    {
        return this.lastOpId++;
    }

    private async DumpASTEmscripten(shaderDocument: ShaderDocument): Promise<string>
    {
        if (!this.panel)
        {
            throw new Error("no preview panel");
        }

        let code = await shaderDocument.getPreprocessedCode();

        let inputs = await HLSLCompiler.GetInputs(
            shaderDocument.fileName,
            code,
            shaderDocument.includeDirs);

        let metadata = await HLSLCompiler.Preprocess(shaderDocument, inputs);

        code = metadata.text;

        let compileResultPromise = await this.SendMessageWithResponse('dumpAST', {
            documentId: shaderDocument.documentId,
            code: code,
            filename: `src_${shaderDocument.documentId}`,
            entryPoint: shaderDocument.entryPointName,
            defines: await shaderDocument.getEnabledIfdefs(),
            profile: ((shaderDocument.shaderType === ShaderType.pixel) ||
                        (shaderDocument.shaderType === ShaderType.buffer))
                        ? 'ps_6_4' : 'vs_6_4'
        });

        let compileResult = await compileResultPromise;

        if (!compileResult.success)
        {
            throw compileResult.error;
        }

        return compileResult.data;
    }

    private async GetSyntaxTree(shaderDocument: ShaderDocument)
    {
        if (this.useNativeBinaries)
        {
            return this.recompiler.hlsl.GetSyntaxTree(shaderDocument);
        }
        else
        {
            return SyntaxTreeParser.Parse(await this.DumpASTEmscripten(shaderDocument));
        }
    }
    private async handlePreprocessedCode(shaderDocument: ShaderDocument, code: string, forceSelectEntryPoint:boolean = false)
    {
        let syntaxTree = await this.GetSyntaxTree(shaderDocument);

        let functions = SyntaxTreeParser.getFunctions(syntaxTree);

        let functionNames:string[] = functions.map(f => (f || { name: ''}).name);

        let defaultEntryPoint = functionNames.length ? functionNames[functionNames.length - 1] : 'main';

        functionNames = functionNames.reverse();

        let settingsKey = shaderDocument.fileName + '__codegen_entry_point';

        let unresolved = new Utils.UnresolvedIncludes();
        code = await Utils.ResolveIncludes(shaderDocument.fileName, shaderDocument.text, shaderDocument.includeDirs, unresolved);
        if (unresolved.length)
        {
            console.error('UNRESOLVED INCLUDES:', unresolved.filenames.join(', '));

            unresolved.includes.map(i =>
            {
                let pairs: {filename: string, parent: string, line: number }[] = [];

                i.parents.forEach(p =>
                {
                    pairs.push({filename: i.filename, parent: p.filename, line: p.charIndex});
                });

                vscode.window.showErrorMessage('Failed to resolve includes:\n' +
                    pairs.map(p => `${p.filename} at ${p.parent}:${p.line}`).join('\n')
                );
            });
        }

        const generateCode = (entryPointName: string) =>
        {
            let args = '';

            let func = functions.find(f => (f !== null) && (f.name === entryPointName));
            if (!func)
            {
                console.error('selected function not found:', entryPointName);
                return;
            }

            args = func.args.map(arg => arg ? arg.name : '').join(', ');

            vscode.env.clipboard.writeText(
                `struct CustomFunctions\n{\n${code}\n};\n\n` +
                `return CustomFunctions::${entryPointName}(${args});\n\n`
            );
        };

        let LastEntryPoint = this.context.workspaceState.get(settingsKey, '');
        if (LastEntryPoint && functionNames.indexOf(LastEntryPoint) >= 0)
        {
            defaultEntryPoint = LastEntryPoint;
            if (!forceSelectEntryPoint)
            {
                return generateCode(defaultEntryPoint);
            }
        }

		let dialogOptions: vscode.InputBoxOptions = {
			prompt: "Entry point name (e.g. main)",
			placeHolder: 'entry point',
			value: defaultEntryPoint,
			valueSelection: [0, defaultEntryPoint.length],
        };


        if (functionNames.length)
        {
            vscode.window.showQuickPick(functionNames.map(f =>
            {
                return {
                    label: f,
                    picked: f === functionNames[functionNames.length - 1]
                };
            }),
            {
                canPickMany: false,
                placeHolder: 'main'
            }).then((item =>
            {
                if (!item)
                {
                    return;
                }

                this.context.workspaceState.update(settingsKey, item.label);

                generateCode(item.label);
            }));
        }
        else
        {
            vscode.window.showInputBox(dialogOptions).then(
                ((entryPointName: string|undefined) =>
                {
                    if (!entryPointName)
                    {
                        return;
                    }

                    this.context.workspaceState.update(settingsKey, entryPointName);

                    generateCode(entryPointName);

                }).bind(this)
            );
        }

    }

	public async PreviewDocument(document: vscode.TextDocument)
	{
		let defaultEntryPoint:string = this.context.workspaceState.get('hlsl.preview.entrypoint') || "main";

		let dialogOptions: vscode.InputBoxOptions = {
			prompt: "Entry point name (e.g. main)",
			placeHolder: 'main',
			value: defaultEntryPoint,
			valueSelection: [0, defaultEntryPoint.length],
        };

        let shaderDocument = new ShaderDocument(this.context, this.GetNextDocumentIndex(), document);
        shaderDocument.includeDirs = this.recompiler.GetIncludeDirectories(shaderDocument);

        let functionNames:string[] = [];

        if (this.useNativeBinaries || this.panel)
        {
            try
            {
                functionNames = SyntaxTreeParser.getFunctions(
                    await this.GetSyntaxTree(shaderDocument)
                ).map(f => (f || { name: ''}).name);
            }
            catch(e)
            {
                functionNames = [];
            }
        }

        functionNames = functionNames.reverse();

        let bufferCount = Object.keys(this.documents)
            .map(key => this.documents[key])
            .filter(doc => doc.shaderType === ShaderType.buffer)
            .length;

		let defaultShaderType:string = this.context.workspaceState.get('hlsl.preview.shadertype') || "pixel";

		let item: { label:  string, description: string } | undefined = await vscode.window.showQuickPick([
			{
				label: 'pixel',
				description: ' - set pixel shader'
			},
			{
				label: 'vertex',
				description: ' - set vertex shader'
			},
			{
				label: 'buffer',
				description: ' - add pixel buffer'
			}
		], {
			canPickMany: false,
			placeHolder: defaultShaderType
        });

        if (!item)
        {
            return;
        }

        let entryPointName;

        if (functionNames.length)
        {
            entryPointName = ((await vscode.window.showQuickPick(functionNames.map(f =>
            {
                return {
                    label: f,
                    picked: f === functionNames[functionNames.length - 1]
                };
            }),
            {
                canPickMany: false,
                placeHolder: 'main'
            })) || { label: 'main' }).label;
        }
        else
        {
            entryPointName = await vscode.window.showInputBox(dialogOptions);
        }

        if (!entryPointName)
        {
            return;
        }

        shaderDocument.shaderType = ShaderType.from(item.label);
        shaderDocument.entryPointName = entryPointName;

        if (shaderDocument.shaderType === ShaderType.buffer)
        {
            let settingsKey = `entry_point_name_${shaderDocument.fileName}_${entryPointName}`;

            let bufferDefaultName = `Buffer${bufferCount}`;

            bufferDefaultName = this.context.workspaceState.get<string>(settingsKey, bufferDefaultName);

            let bufferDialogOptions: vscode.InputBoxOptions = {
                prompt: "Buffer name",
                placeHolder: 'main',
                value: bufferDefaultName,
                valueSelection: [0, bufferDefaultName.length],
            };

            let bufferName = await vscode.window.showInputBox(bufferDialogOptions);

            if (bufferName)
            {
                bufferName = bufferName.trim();
            }

            if (!bufferName)
            {
                return;
            }

            this.context.workspaceState.update(settingsKey, bufferName);

            shaderDocument.bufferName = bufferName;

            let key = this.makeDocumentsKey(shaderDocument);
            if (key in this.documents)
            {
                if (this.panel)
                {
                    this.panel.webview.postMessage({
                        command: "forgetShader",
                        data: {
                            documentId: this.documents[key].documentId
                        }
                    });
                }
            }
            this.documents[key] = shaderDocument;
            this.StartPreview();
        }
        else
        {
            let key = this.makeDocumentsKey(shaderDocument);
            if (key in this.documents)
            {
                if (this.panel)
                {
                    this.panel.webview.postMessage({
                        command: "forgetShader",
                        data: {
                            documentId: this.documents[key].documentId
                        }
                    });
                }
            }
            this.documents[key] = shaderDocument;
            this.StartPreview();
        }
	}

	public async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
	{
        let documents = this.GetShaderDocuments(event.document);

		if (Object.keys(documents).length)
		{
            let shaders: { [key:string]: ShaderDocument } = {};

            Object.keys(documents).forEach(key =>
            {
                let shaderDocument = documents[key];
                shaders[this.makeDocumentsKey(shaderDocument)] = documents[key];
            });

            this.UpdateShaders(shaders);
        }

        let keys = Object.keys(this.documents);
        for(let i = 0; i < keys.length; ++i)
        {
            let key = keys[i];
            let doc = this.documents[key];
            let includes: Utils.ResolvedIncludes = new Utils.ResolvedIncludes();
            let unresolved = new Utils.UnresolvedIncludes();

            await Utils.FindAllIncludes(doc.fileName, doc.text || '', this.recompiler.GetIncludeDirectories(doc), includes, unresolved)

            if (unresolved.length > 0)
            {
                console.error("UNRESOLVED INCLUDES:", unresolved.filenames.join(', '));

                unresolved.includes.map(i =>
                {
                    let pairs: {filename: string, parent: string, line: number }[] = [];

                    i.parents.forEach(p =>
                    {
                        pairs.push({filename: i.filename, parent: p.filename, line: p.charIndex});
                    });

                    vscode.window.showErrorMessage('Failed to resolve includes:\n' +
                        pairs.map(p => `${p.filename} at ${p.parent}:${p.line}`).join('\n')
                    );
                });
            }

            if (event.document.fileName in includes)
            {
                documents[this.makeDocumentsKey(doc)] = doc;
            }
        }
	}

	public GetShaderDocuments(document: vscode.TextDocument): { [key:string]: ShaderDocument }
	{
        let result: { [key:string]: ShaderDocument } = {};

        Object.keys(this.documents).forEach(key =>
        {
            let shaderDocument = this.documents[key];
            if (shaderDocument.document === document)
            {
                result[this.makeDocumentsKey(shaderDocument)] = shaderDocument;
            }
        });

        return result;
	}

	public GetShaderDocumentById(documentId: number): ShaderDocument | undefined
	{
        let key = Object.keys(this.documents).find(key => this.documents[key].documentId === documentId);

        if (key)
        {
            return this.documents[key];
        }

        return undefined;
	}

	public GetShaderDocumentsByIds(documentIds: number[]): { [key:string]: ShaderDocument }
	{
		let foundIds = new Set<number>();

		let shaderDocuments: { [key:string]: ShaderDocument } = {};

		documentIds.forEach((documentId: number) =>
        {
            if (foundIds.has(documentId))
            {
                return;
            }

            let shaderDocument = this.GetShaderDocumentById(documentId);

            if (!shaderDocument)
            {
                return;
            }

            foundIds.add(documentId);

            shaderDocuments[this.makeDocumentsKey(shaderDocument)] = shaderDocument;
        });

		return shaderDocuments;
	}

	public StartPreview(): void
	{
        this.loadConfiguration();

		if (Object.keys(this.documents).length === 0)
		{
			console.error('HLSLPreview: no documents to preview');
			return;
		}

		if (this.trigger !== this.triggerSubscribed)
		{
			if (this.trigger === RunTrigger.onType)
			{
				vscode.workspace.onDidChangeTextDocument((
					(event: vscode.TextDocumentChangeEvent) =>
					{
                        this.onDidChangeTextDocument(event);
                        this.UpdateShaders();
					}
				).bind(this));
			}
			else
			{
				vscode.workspace.onDidSaveTextDocument((
					(document: vscode.TextDocument) =>
					{
                        this.UpdateShaders();
					}
				).bind(this));
			}

			this.triggerSubscribed = this.trigger;
		}

		const columnToShowIn: vscode.ViewColumn =
			(this.panel && (typeof(this.panel.viewColumn) !== 'undefined'))
				? this.panel.viewColumn
				: vscode.ViewColumn.Two;

		if (this.panel)
		{
			this.panel.reveal(this.panel.viewColumn);
		}
		else
		{
			this.panel = vscode.window.createWebviewPanel(
				'hlslpreview',
				'HLSL preview',
				columnToShowIn,
				{
					localResourceRoots: [
						vscode.Uri.file(this.context.asAbsolutePath('media')),
						vscode.Uri.file(this.context.asAbsolutePath(path.join('media', 'scripts'))),
                        vscode.Uri.file(this.context.asAbsolutePath(path.join('media', 'css'))),
                        vscode.Uri.file(this.context.asAbsolutePath(path.join('out', 'WebView'))),
					],
                    enableScripts: true,
                    retainContextWhenHidden: this.retainContextWhenHidden,
                    enableCommandUris: true
				}
            );

            this.updateWebviewContent();

            this.panel.webview.onDidReceiveMessage(((e: any) =>
            {
                if ('data' in e && 'responseId' in e.data)
                {
                    this.MessageReceivedBroadcast(e.type, e.data.responseId, e.data);
                }
                else {
                switch (e.type)
                {
                    case 'removeBuffer':
                    {
                        let documentId = e.data.documentId;

                        let key = Object.keys(this.documents)
                            .find(key => this.documents[key].documentId === documentId);

                        if (key)
                        {
                            delete this.documents[key];
                        }
                    }
                    break;
                    case 'setBufferName':
                    {
                        let shaderDocument = this.GetShaderDocumentById(e.data.documentId);
                        if (shaderDocument)
                        {
                            shaderDocument.bufferName = e.data.bufferName;
                        }

                    }
                    break;
                    case 'updateBufferSettings':
                    {
                        let shaderDocument = this.GetShaderDocumentById(e.data.documentId);
                        if (shaderDocument)
                        {
                            shaderDocument.bufferSettings = e.data.bufferSettings;
                        }
                    }
                    break;
                    case 'updateSettings':
                    {
                        let settings = this.context.workspaceState.get<object>("settings", {});

                        Object.assign(settings, e.data);

                        this.context.workspaceState.update("settings", settings);
                    }
                    break;
                    case 'selectSaveImage':
                    {
                        let dialogOptions: vscode.InputBoxOptions = {
                            prompt: "Image resolution (default: 1024x1024) ",
                            value: this.context.workspaceState.get<string>("fileRenderResolution", ''),
                            placeHolder: 'examples: 2048, 1024x1024, 1920 by 1080, 4k'
                        };

                        vscode.window.showInputBox(dialogOptions).then((value: string | undefined) =>
                        {
                            if (typeof(value) === 'undefined')
                            {
                                return;
                            }

                            let parts = (value || '1024x1024').split(/[\D\s]+/);

                            const DefaultSize = 1024;

                            let width = DefaultSize;
                            let height = DefaultSize;

                            let m;

                            if (m = /(\d+)k/.exec(value))
                            {
                                width = height = (parseInt(m[1]) || 1) * 1024;
                            }
                            else if (parts.length === 1)
                            {
                                width = height = parseInt(parts[0]) || DefaultSize;
                            }
                            else if (parts.length === 2)
                            {
                                width = parseInt(parts[0]) || DefaultSize;
                                height = parseInt(parts[1]) || DefaultSize;
                            }

                            this.context.workspaceState.update('fileRenderResolution', value);

                            let options: vscode.SaveDialogOptions = {
                                filters: {
                                    'PNG': [ 'png' ],
                                    'JPEG': [ 'jpg', 'jpeg' ],
                                    'WebP': [ 'webp' ],
                                    'Bitmap': [ 'bmp' ]
                                }
                            };

                            vscode.window.showSaveDialog(options).then((uri: vscode.Uri | undefined) =>
                            {
                                if (uri && this.panel)
                                {
                                    let path = uri.path;
                                    if (/^\/[A-Z]:\/.*$/.test(path))
                                    {
                                        path = path.substr(1);
                                    }

                                    let mimeType = 'image/png';

                                    switch(path.split('.').pop())
                                    {
                                        case 'jpg':
                                        case 'jpeg':
                                            mimeType = 'image/jpeg';
                                        break;
                                        case 'bmp':
                                            mimeType = 'image/bmp';
                                        break;
                                        case 'webp':
                                            mimeType = 'image/webp';
                                        break;
                                    }

                                    this.panel.webview.postMessage({
                                        command: "saveImage",
                                        data: {
                                            mimeType: mimeType,
                                            path: path,
                                            width: width,
                                            height: height
                                        }
                                    });
                                }
                            }, () => {

                            });
                        });
                    }
                    break;
                    case 'saveImage':
                    {
                        let data = e.data;

                        let image = data.image.substr(data.image.indexOf(',') + 1);
                        image = Base64.toByteArray(image);

                        fs.writeFile(data.path, image, {
                            encoding: null,
                            flag: 'w'
                        }, (err) => {
                            if (err)
                            {
                                vscode.window.showErrorMessage(`failed to save image: ${err}`);
                            }
                        });
                    }
                    break;
                    case 'ready':
                        this.panelReady = true;
                    break;
                    case 'shader':
                    {

                    }
                    break;
                    case 'getUniforms':
                    {
						if (this.panel)
						{
                            let opId = e.data.opId;

                            let documentId: number = e.data.documentId;

                            let shaderDocument = this.GetShaderDocumentById(documentId);

                            if (!shaderDocument)
                            {
                                console.error('uniforms request shader document not found: ' + documentId);
                                return;
                            }

                            this.panel.webview.postMessage({
                                command: "loadUniforms",
                                data: {
                                    documentId: shaderDocument.documentId,
                                    opId: opId,
                                    uniforms: shaderDocument.loadUniformsValues(),
                                    textures: shaderDocument.textures
                                }
                            });
                        }
                    }
					break;
                    case 'update':
                    {
                        this.loadConfiguration();
                        this.UpdateShaders(this.documents);
                    }
					break;
                    case 'updateUniforms':
                    {
                        let shaderDocument = this.GetShaderDocumentById(e.data.documentId);
                        if (shaderDocument)
                        {
                            shaderDocument.saveUniformsValues(e.data.uniforms);
                        }
                    }
					break;
                    case 'updateEnabledIfdefs':
                    {
                        let newEnabledIfdefs = e.data.ifdefs || [];

                        let shaderDocument = this.GetShaderDocumentById(e.data.documentId);

                        if (shaderDocument)
                        {
                            shaderDocument.setEnabledIfdefs(newEnabledIfdefs);

                            // TODO: pass document id to linter
                            vscode.commands.executeCommand('hlsl.linter.setifdefs', JSON.stringify(newEnabledIfdefs));

                            shaderDocument.getNeedsUpdate().then(value => {
                                if (value) { this.UpdateShaders(); }
                            });
                        }
                    }
					break;
                    case 'openFile':
						vscode.window.showOpenDialog({
							canSelectFiles: true,
							canSelectFolders: false,
							canSelectMany: false,
							filters: {
								Images: ['png', 'jpg', 'tga', 'bmp', 'gif', 'dds', 'tif']
							}
						}).then((
                            (opId: number, uris: vscode.Uri[] | undefined) =>
                            {
                                if (!uris)
                                {
                                    console.error('showOpenDialog failed!');
                                    return;
                                }

                                let filename = uris[0].fsPath;

                                Utils.LoadFileAsDataUri(filename).then((
                                    (opId:number, dataUri:string) =>
                                    {
                                        if (this.panel)
                                        {
                                            this.panel.webview.postMessage({
                                                command: 'openFile',
                                                data: {
                                                    filename: filename,
                                                    opId: opId,
                                                    data: dataUri
                                                }
                                            });
                                        }
                                    }
                                ).bind(this, opId));
                            }
                        ).bind(this, e.data.opId));
					break;
					case 'loadFile':
						let opId = e.data.opId;
                        let filename = e.data.filename;
                        Utils.LoadFileAsDataUri(filename).then((
                            (opId:number, filename: string, dataUri:string) =>
                            {
                                if (this.panel)
                                {
                                    this.panel.webview.postMessage({
                                        command: 'loadFile',
                                        data: {
                                            filename: filename,
                                            opId: opId,
                                            data: dataUri
                                        }
                                    });
                                }
                            }
                        ).bind(this, opId, filename));
					break;
                    case 'goto':
                    {
						let lineNumber = parseInt(e.data.line);
                        let columnNumber = parseInt(e.data.column);
                        let filename = e.data.filename;

                        console.log(`goto ${filename}:${lineNumber}:${columnNumber}`);
                        const FindDocumentByFilname = (filename: string) =>
                        {
                            return vscode.workspace.textDocuments.find(
                                (doc) => path.normalize(doc.fileName) === path.normalize(filename)
                            );
                        };

                        const SetCursor = (editor: vscode.TextEditor, line: number, column: number) =>
                        {
                            let range = editor.document.lineAt(lineNumber-1).range;

                            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

                            let cursor = editor.selection.active;
                            let pos = cursor.with(lineNumber - 1, columnNumber - 1);
                            editor.selection = new vscode.Selection(pos, pos);
                        };

                        // const ActivateEditorPanel = (editor: vscode.TextEditor) =>
                        // {
                        //     let cmd = 'workbench.action.focusFirstEditorGroup';

                        //     if (editor.viewColumn === 2)
                        //     {
                        //         cmd = 'workbench.action.focusSecondEditorGroup';
                        //     }

                        //     vscode.commands.executeCommand(cmd);
                        // };

                        let column = vscode.ViewColumn.One;
                        if (this.panel)
                        {
                            if (this.panel.viewColumn === vscode.ViewColumn.One)
                            {
                                column = vscode.ViewColumn.Two;
                            }
                        }

                        let doc = FindDocumentByFilname(filename);
                        if (doc)
                        {

                            vscode.window.showTextDocument(doc, {
                                viewColumn: column
                            }).then((editor: vscode.TextEditor) => {
                                SetCursor(editor, lineNumber, columnNumber);
                            });
                        }
                        else
                        {
                            vscode.window.showTextDocument(vscode.Uri.file(path.normalize(filename)), {
                                viewColumn: column
                            }).then((editor: vscode.TextEditor) => {
                                SetCursor(editor, lineNumber, columnNumber);
                            });
                        }
                    }
                    break;
                    case 'loadConfiguration':
                        let key = "settings";

                        let settings = this.context.workspaceState.get<object>(key, {});

                        WebUtils.MergeObjects(settings, e.data);

                        this.context.workspaceState.update(key, settings);
                    break;
                    case 'getSettings':
                        if (this.panel)
                        {
                            this.panel.webview.postMessage({
                                command: "settings",
                                data: this.context.workspaceState.get<object>("settings", {}),
                                opId: e.data.opId
                            });
                        }
                    break;
				}
                }
            }).bind(this));

			this.panel.onDidDispose(
				() => {
                    this.panel = undefined;
                    this.documents = {};
				},
				null
			);
        }

        this.UpdateShaders();
	}

    public LoadDocumentsUniformsDesc(shaderDocuments: { [key:string]: ShaderDocument }): object
	{
		let result = {};

		Object.keys(shaderDocuments).forEach(
			(key:string) =>
			{
                let shaderDocument = shaderDocuments[key];
                if (shaderDocument.glslCode)
                {
                    WebUtils.MergeObjects(result, shaderDocument.glslCode.uniforms);
                }
			}
		);

		return result;
    }

	public LoadDocumentsUniforms(shaderDocuments: { [key:string]: ShaderDocument }): object
	{
		let result = {};

		Object.keys(shaderDocuments).forEach(
			(key:string) =>
			{
                let shaderDocument = shaderDocuments[key];
                WebUtils.MergeObjects(result, shaderDocument.loadUniformsValues());
			}
		);

		return result;
    }

    public LoadDocumentsTextures(shaderDocuments: { [key:string]: ShaderDocument }): object
    {
		let result = {};

        Object.keys(shaderDocuments)
        .forEach((key:string) =>
        {
            let shaderDocument = shaderDocuments[key];
            WebUtils.MergeObjects(result, shaderDocument.textures);
        });

		return result;
    }

    private throttledDelayer: ThrottledDelayer<ShaderDocument[]> | undefined;

    public async GetDocumentsNeedUpdate(): Promise<ShaderDocument[]>
    {
        let needsUpdates = await Promise.all(
            Object.keys(this.documents)
                .map(key => this.documents[key])
                .map(doc => doc.getNeedsUpdate().then((value: boolean) => value ? doc : null)));

        let result: ShaderDocument[] = [];

        needsUpdates.forEach(doc => {
            if (doc) { result.push(doc); }
        });

        return result;
    }

    public async UpdateShaders(documents: { [key:string]: ShaderDocument } = {}): Promise<ShaderDocument[]>
    {
        Object.keys(documents).forEach(key => documents[key].setNeedsUpdate(true));

        let documentsToUpdate = await this.GetDocumentsNeedUpdate();

        if (documentsToUpdate.length <= 0)
        {
            return new Promise<Promise<ShaderDocument[]>>((resolve, _) => resolve());
        }

        if (!this.throttledDelayer)
        {
            this.throttledDelayer = new ThrottledDelayer<ShaderDocument[]>(this.delay);
        }

        // TODO: retry if rejected!
        return await this.throttledDelayer.trigger(this.DoUpdateShaders.bind(this));
        // return new ThrottledDelayer<ShaderDocument[]>(this.delay).trigger(this.DoUpdateShaders.bind(this));
    }

    public postMessage(command: string, data: any)
    {
        if (this.panel)
        {
            data = data || {};
            this.panel.webview.postMessage({
                command: command,
                data: data
            });
        }
    }

    private async SendMessageWithResponse(command: string, message: any)
    {
        if (!this.panel)
        {
            console.error('SendMessageWithResponse: this.panel: null');
            return;
        }

        let responseId = this.getNextOpId();

        let resultPromise = this.ReceiveMessage(command, responseId);

        message.responseId = responseId;

        this.panel.webview.postMessage({
            command: command,
            data: message
        });

        return resultPromise;
    }

    private async UpdateShaderDocumentEmscripten(shaderDocument: ShaderDocument): Promise<ShaderDocument>
    {
        if (!this.panel)
        {
            throw new Error("no preview panel");
        }

        shaderDocument.setNeedsUpdate(false);
        let code = await shaderDocument.getPreprocessedCode();
        shaderDocument.lastCompiledCode = code;
        shaderDocument.lastCompiledIfdefs = await shaderDocument.getEnabledIfdefs();

        let inputs = await HLSLCompiler.GetInputs(
            shaderDocument.fileName,
            code,
            shaderDocument.includeDirs);

        let metadata = await HLSLCompiler.Preprocess(shaderDocument, inputs);

        let text = metadata.text;
        delete metadata.text;

        let compileResult = await this.SendMessageWithResponse('compileShader', {
                documentId: shaderDocument.documentId,
                version: shaderDocument.version,
                code: text,
                filename: `src_${shaderDocument.documentId}`,
                reflect: true,
                entryPoint: shaderDocument.entryPointName,
                defines: await shaderDocument.getEnabledIfdefs(),
                profile: ((shaderDocument.shaderType === ShaderType.pixel) ||
                            (shaderDocument.shaderType === ShaderType.buffer))
                            ? 'ps_6_4' : 'vs_6_4',
                metadata: metadata
        });

        if (compileResult.success)
        {
            shaderDocument.glslCode = new GLSLCode(shaderDocument, compileResult.glsl, compileResult.reflection);
        }
        else
        {
            throw compileResult.error;
        }

        for (let i = shaderDocument.promises.length - 1; i >= 0; --i)
        {
            let promise = shaderDocument.promises[i];
            if (promise.version <= compileResult.version)
            {
                if (compileResult.success)
                {
                    promise.resolve(shaderDocument);
                }
                else
                {
                    promise.reject(compileResult.error);
                }
                shaderDocument.promises.splice(i, 1);
            }
        }

        return shaderDocument;
    }

    private async UpdateShaderDocumentBinary(shaderDocument: ShaderDocument): Promise<ShaderDocument>
    {
        await this.recompiler.HLSL2GLSL(shaderDocument);
        return shaderDocument;
    }

    private async UpdateShaderDocument(shaderDocument: ShaderDocument): Promise<ShaderDocument>
    {
        shaderDocument.isBeingUpdated = true;

        try
        {
            if (this.useNativeBinaries)
            {
                await this.UpdateShaderDocumentBinary(shaderDocument);
            }
            else
            {
                await this.UpdateShaderDocumentEmscripten(shaderDocument);
            }
        }
        catch(e)
        {
            if (this.panel)
            {
                this.panel.webview.postMessage({
                    command: 'showErrorMessage',
                    data: {
                        message: e,
                        documentId: shaderDocument.documentId
                    }
                });
            }
            throw e;
        }
        finally
        {
            shaderDocument.isBeingUpdated = false;
        }

        if (shaderDocument.glslCode)
        {
            this.SendShaderToWebview(shaderDocument);
        }

        if (this.panel)
        {
            this.panel.webview.postMessage({
                command: 'showErrorMessage',
                data: {
                    message: '',
                    documentId: shaderDocument.documentId
                }
            });
        }

        return shaderDocument;
    }

    private async SendShaderToWebview(shaderDocument: ShaderDocument)
    {
        if (!this.panel) { return; }

        this.panel.webview.postMessage({
            command: 'updateShader',
            data: {
                documentId: shaderDocument.documentId,
                shader: this.makeDocumentsKey(shaderDocument),
                fileBaseName: shaderDocument.fileBaseName,
                entryPointName: shaderDocument.entryPointName,
                bufferName: shaderDocument.bufferName,
                type: ShaderType.GetShaderTypeName(shaderDocument.shaderType),
                code: shaderDocument.glslCode ? shaderDocument.glslCode.code : '',
                uniforms: shaderDocument.glslCode ? shaderDocument.glslCode.uniforms : {},
                textures: shaderDocument.textures,
                ifdefs: await shaderDocument.getIfdefs(),
                enabledIfdefs: await shaderDocument.getEnabledIfdefs(),
                bufferSettings: shaderDocument.shaderType === ShaderType.buffer
                    ? shaderDocument.bufferSettings
                    : undefined
            }
        });
    }

    private async DoUpdateShaders(): Promise<ShaderDocument[]>
    {
        if (!this.panelReady)
        {
            return [];
        }

        let documentsToUpdate = await this.GetDocumentsNeedUpdate();

        documentsToUpdate.forEach(doc => doc.setNeedsUpdate(false));

        let result = await Promise.all(documentsToUpdate.map(shaderDocument =>
            this.UpdateShaderDocument(shaderDocument)
        ));

        this.UpdateShaders();

        return result;
	}
}

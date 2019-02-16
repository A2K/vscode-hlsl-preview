import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

import GLSLCode from './GLSLCode';
import ObjectMerger from './ObjectMerger';
import ShaderDocument from './ShaderDocument';
import HLSLtoGLSLRecompiler from './HLSLtoGLSLRecompiler';
import ThrottledDelayer from './ThrottledDelayer';
import { ShaderType, RunTrigger } from './Enums';
import { GetWebviewContent } from './WebViewContent';

import * as Utils from './Utils';
import HLSLCompiler from './HLSLCompiler';

import * as Base64 from 'base64-js';
import WASMWebServer from './WASMWebServer';


export default class HLSLPreview
{
	private panel: vscode.WebviewPanel | undefined = undefined;

	private documents: { [key:string]: ShaderDocument } = { };

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
                    this.panel.webview.html = GetWebviewContent(this.context, this.useNativeBinaries, true, port);
                }
            });
        }
        else
        {
            this.panel.webview.html = GetWebviewContent(this.context, this.useNativeBinaries, false, 0);
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

	public PreviewDocument(document: vscode.TextDocument)
	{
		let defaultEntryPoint:string = this.context.workspaceState.get('hlsl.preview.entrypoint') || "main";

		let dialogOptions: vscode.InputBoxOptions = {
			prompt: "Entry point name (e.g. main)",
			placeHolder: 'main',
			value: defaultEntryPoint,
			valueSelection: [0, defaultEntryPoint.length],
		};

		let defaultShaderType:string = this.context.workspaceState.get('hlsl.preview.shadertype') || "pixel";

		let shaderDocument = new ShaderDocument(this.context, this.GetNextDocumentIndex(), document);

		vscode.window.showQuickPick([
			{
				label: 'pixel',
				description: 'shader runs on individual pixels'
			},
			{
				label: 'vertex',
				description: 'shader runs on individual vertices'
			}
		], {
			canPickMany: false,
			placeHolder: defaultShaderType
		}).then((
			(
				shaderDocument : ShaderDocument,
				item  		   : { label:  string, description: string } | undefined
			) =>
			{
                if (!item)
                {
					return;
				}

				shaderDocument.shaderType = ShaderType.from(item.label);

                vscode.window.showInputBox(dialogOptions).then(
                    ((shaderDocument: ShaderDocument, value: string|undefined) =>
                    {
                        if (typeof(value) === 'undefined')
                        {
                            return;
                        }

                        if (value === "")
                        {
                            value = "main";
                        }

                        shaderDocument.entryPointName = value;

                        this.documents[shaderDocument.shaderType.toString()] = shaderDocument;

                        this.StartPreview();
                    }
                ).bind(this, shaderDocument));
			}
		).bind(this, shaderDocument));
	}

	public onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
	{
		let documents = this.GetShaderDocuments(event.document);

		if (documents)
		{
            let shaders: { [key:string]: ShaderDocument } = {};
            Object.keys(documents).forEach(key => {
                let document = documents[key];
                shaders[document.shaderType.toString()] = document;
            });
            this.UpdateShaders(shaders);
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
                result[shaderDocument.shaderType.toString()] = shaderDocument;
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

		documentIds.forEach(
			(documentId: number) =>
			{
				if (!foundIds.has(documentId))
				{
					let shaderDocument = this.GetShaderDocumentById(documentId);

					if (shaderDocument)
					{
						foundIds.add(documentId);

						shaderDocuments[shaderDocument.shaderType.toString()] = shaderDocument;
					}
				}
			}
		);

		return shaderDocuments;
	}

	public SetShaderDocumentNeedsUpdate(document: vscode.TextDocument): { [key:string]: ShaderDocument } | undefined
	{
		let shaderDocuments = this.GetShaderDocuments(document);

		if (shaderDocuments)
		{
            this.UpdateShaders(shaderDocuments);
        }

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
						this.SetShaderDocumentNeedsUpdate(event.document);
					}
				).bind(this));
			}
			else
			{
				vscode.workspace.onDidSaveTextDocument((
					(document: vscode.TextDocument) =>
					{
						this.SetShaderDocumentNeedsUpdate(document);
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
						vscode.Uri.file(this.context.asAbsolutePath(path.join('.', 'media'))),
						vscode.Uri.file(this.context.asAbsolutePath(path.join('media', 'scripts'))),
						vscode.Uri.file(this.context.asAbsolutePath(path.join('media', 'css')))
					],
					enableScripts: true
				}
            );

            this.updateWebviewContent();

            this.panel.webview.onDidReceiveMessage(((e: any) =>
            {
                switch (e.type)
                {
                    case 'selectSaveImage':
                    {
                        let dialogOptions: vscode.InputBoxOptions = {
                            prompt: "Image resolution (default: 1024) ",
                            placeHolder: 'examples: 4096, 1024x1024, 1920 by 1080'
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
                        let documentId = e.data.documentId;
                        let shaderDocument = this.GetShaderDocumentById(documentId);
                        if (shaderDocument)
                        {
                            if (e.data.success)// && e.data.version > (shaderDocument.lastUpdateVersion || 0))
                            {
                                shaderDocument.glslCode = new GLSLCode(shaderDocument, e.data.glsl, e.data.reflection);
                                shaderDocument.lastUpdateVersion = e.data.version;
                            }

                            for (let i = shaderDocument.promises.length - 1; i >= 0; --i)
                            {
                                let promise = shaderDocument.promises[i];
                                if (promise.version <= e.data.version)
                                {
                                    if (e.data.success)
                                    {
                                        promise.resolve(shaderDocument);
                                    }
                                    else
                                    {
                                        promise.reject(e.data.error);
                                    }
                                    shaderDocument.promises.splice(i, 1);
                                }
                            }
                        }
                    }
                    break;
					case 'getUniforms':
						if (this.panel)
						{
                            let opId = e.data.opId;

                            let documentIds: number[] = ((e.data instanceof Object) && (e.data.documentIds instanceof Array))
                                ? e.data.documentIds
                                : Object.keys(this.documents).map(key => this.documents[key].documentId);

                            let shaderDocuments: { [key:string]: ShaderDocument } = {};

                            documentIds.forEach(
                                (documentId:number) =>
                                {
                                    let shaderDocument = this.GetShaderDocumentById(documentId);
                                    if (shaderDocument)
                                    {
                                        shaderDocuments[shaderDocument.shaderType.toString()] = shaderDocument;
                                        //shaderDocuments.push(shaderDocument);
                                    }
                                }
                            );

                            this.panel.webview.postMessage({
                                command: "loadUniforms",
                                data: {
                                    opId: opId,
                                    uniforms: this.LoadDocumentsUniforms(shaderDocuments),
                                    textures: this.LoadDocumentsTextures(shaderDocuments)
                                }
                            });
						}
					break;
                    case 'update':
                    {
                        this.loadConfiguration();
						if ((e.data instanceof Object) && (e.data.documentIds instanceof Array))
						{
							let documentsToUpdate = this.GetShaderDocumentsByIds(e.data.documentIds);
							if (documentsToUpdate.length)
							{
								this.UpdateShaders(documentsToUpdate);
							}
						}
						else
						{
							this.UpdateShaders(this.documents);
                        }
                    }
					break;
                    case 'updateUniforms':
                        Object.keys(this.documents).map(key => this.documents[key]).forEach(
                            (shaderDocument: ShaderDocument) =>
                            {
                                shaderDocument.uniforms = e.data;
                                // let key = 'uniforms_' + shaderDocument.document.uri.toString();
                                // this.context.workspaceState.update(key, e.data.uniforms);
                            }
                        );
					break;
                    case 'updateEnabledIfdefs':

                        let newEnabledIfdefs = (e.data instanceof Array) ? e.data :
                            ((e.data && e.data.ifdefs instanceof Array) ? e.data.ifdefs : []);

                        let shaderDocuments = ((e.data instanceof Object) && (e.data.documentIds instanceof Array))
                            ? this.GetShaderDocumentsByIds(e.data.documentIds)
                            : this.documents;

                        let shadersUpdated: boolean = false;

                        Object.keys(shaderDocuments).map(key => this.documents[key]).forEach(
                            (shaderDocument: ShaderDocument) =>
                            {

                                shaderDocument.enabledIfdefs = newEnabledIfdefs;

                                shadersUpdated = shadersUpdated || shaderDocument.needsUpdate;

                                // TODO: pass document id to linter
                                vscode.commands.executeCommand('hlsl.linter.setifdefs', JSON.stringify(newEnabledIfdefs));
                            }
                        );

                        if (shadersUpdated)
                        {
                            this.UpdateShaders();
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
						let lineNumber = parseInt(e.data.line);
						let columnNumber = parseInt(e.data.column);
						let shaderDocument = this.GetShaderDocumentById(e.data.documentId);
						if (shaderDocument)
						{
							vscode.window.visibleTextEditors.forEach(
								(editor) =>
								{
									if (editor && shaderDocument && (editor.document === shaderDocument.document))
									{
                                        let range = editor.document.lineAt(lineNumber-1).range;

										editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

										let cursor = editor.selection.active;
										let pos = cursor.with(lineNumber - 1, columnNumber - 1);
                                        editor.selection = new vscode.Selection(pos, pos);


                                        let cmd = 'workbench.action.focusFirstEditorGroup';
                                        if (editor.viewColumn === 2)
                                        {
                                            cmd = 'workbench.action.focusSecondEditorGroup';
                                        }

                                        vscode.commands.executeCommand(cmd);
									}
								}
							);
						}
                    break;
                    case 'loadConfiguration':
                        let key = "settings";

                        let settings = this.context.workspaceState.get<object>(key, {});
                        ObjectMerger.MergeObjects(settings, e.data);

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
            }).bind(this));

			this.panel.onDidDispose(
				() => {
					this.panel = undefined;
				},
				null
			);
        }

        this.UpdateShaders(this.documents).then(() =>
        {
            if (this.panel)
            {
                this.panel.webview.postMessage({
                    command: "loadUniforms",
                    data: {
                        uniforms: this.LoadDocumentsUniforms(this.documents),
                        textures: this.LoadDocumentsTextures(this.documents)
                    }
                });
            }
        });
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
                    ObjectMerger.MergeObjects(result, shaderDocument.glslCode.uniforms);
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
                ObjectMerger.MergeObjects(result, shaderDocument.uniforms);
			}
		);

		return result;
    }

    public LoadDocumentsTextures(shaderDocuments: { [key:string]: ShaderDocument }): object
    {
		let result = {};

		Object.keys(shaderDocuments).forEach(
			(key:string) =>
			{
                let shaderDocument = shaderDocuments[key];
                ObjectMerger.MergeObjects(result, shaderDocument.textures);
			}
		);

		return result;
    }

    public UpdateShaders(documents: { [key:string]: ShaderDocument } = {}): Promise<Promise<void | GLSLCode>>
    {
        Object.keys(documents).forEach(key => documents[key].needsUpdate = true);

        let documentsToUpdate = Object.keys(this.documents).map(key => this.documents[key]).filter(doc => doc.needsUpdate);

        if (documentsToUpdate.length <= 0)
        {
            return new Promise<Promise<void |GLSLCode>>((resolve, _) => resolve());
        }

        return new ThrottledDelayer<void | GLSLCode>(this.delay).trigger(
            () => this.DoUpdateShaders().catch((err) => {})
		);
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

    private UpdateShaderDocumentEmscripten(shaderDocument: ShaderDocument): Promise<void>
    {
        return new Promise<void>((resolve, reject) =>
        {
            let compileDocumentVersion = shaderDocument.version;

            if (!this.panel)
            {
                reject("no preview panel");
                return;
            }

            shaderDocument.needsUpdate = false;
            // shaderDocument.isBeingUpdated = true;
            shaderDocument.lastCompiledVersion = compileDocumentVersion;

            this.panel.webview.postMessage({
                command: 'updateIfdefs',
                data: {
                    documentId: shaderDocument.documentId,
                    ifdefs: shaderDocument.ifdefs,
                    enabledIfdefs: shaderDocument.enabledIfdefs
                }
            });

            let metadata = HLSLCompiler.Preprocess(shaderDocument);
            let text = metadata.text;
            delete metadata.text;

            shaderDocument.promises.push({ resolve: resolve, reject: (error: any) => {
                reject(HLSLCompiler.ProcessErrorMessage(shaderDocument.fileBaseName, `src_${shaderDocument.documentId}`, error, metadata));
            }, version: shaderDocument.version });

            this.panel.webview.postMessage({
                command: 'compileShader',
                data: {
                    documentId: shaderDocument.documentId,
                    version: shaderDocument.version,
                    code: text,
                    filename: `src_${shaderDocument.documentId}`,
                    reflect: true,
                    entryPoint: shaderDocument.entryPointName,
                    defines: shaderDocument.enabledIfdefs,
                    profile: shaderDocument.shaderType === ShaderType.pixel ? 'ps_6_4' : 'vs_6_4',
                    metadata: metadata
                }
            });
        });
    }

    private UpdateShaderDocumentBinary(shaderDocument: ShaderDocument): Promise<void>
    {
        return new Promise<void>((resolve, reject) =>
        {
            let compileDocumentVersion = shaderDocument.version;
            if (this.panel)
            {
                this.panel.webview.postMessage({
                    command: 'updateIfdefs',
                    data: {
                        documentId: shaderDocument.documentId,
                        ifdefs: shaderDocument.ifdefs,
                        enabledIfdefs: shaderDocument.enabledIfdefs
                    }
                });
            }
            this.recompiler.HLSL2GLSL(shaderDocument).then(() => {
                shaderDocument.lastUpdateVersion = compileDocumentVersion;
                return resolve();
            }, reject);
        });
    }

    private UpdateShaderDocument(shaderDocument: ShaderDocument): Promise<void>
    {
        if (this.useNativeBinaries)
        {
            return this.UpdateShaderDocumentBinary(shaderDocument);
        }
        else
        {
            return this.UpdateShaderDocumentEmscripten(shaderDocument);
        }
    }

    private DoUpdateShaders(): Promise<void>
    {
        if (!this.panelReady)
        {
            return new Promise<void>((resolve, reject) =>
            {
                reject("compiler not ready");
            });
        }

        return new Promise<void>((resolve, reject) =>
        {

            let documentsToUpdate = Object.keys(this.documents).map(key => this.documents[key]).filter(doc => doc.needsUpdate && !doc.isBeingUpdated);

			if (documentsToUpdate.length <= 0)
			{
				reject("no documents to update");
				return;
            }

            documentsToUpdate.forEach(doc => doc.needsUpdate = false);

            Promise.all(documentsToUpdate.map(shaderDocument => this.UpdateShaderDocument(shaderDocument).then(
                () =>
                {
                    if (!this.panel) { return; }

                    if (shaderDocument.glslCode)
                    {
                        this.panel.webview.postMessage({
                            command: (shaderDocument.shaderType === ShaderType.vertex) ? 'updateVertexShader' : 'updateFragmentShader',
                            data: {
                                documentId: shaderDocument.documentId,
                                code: shaderDocument.glslCode.code,
                                uniforms: this.LoadDocumentsUniformsDesc(this.documents),
                                textures: this.LoadDocumentsTextures(this.documents)
                            }
                        });
                    }

                    this.panel.webview.postMessage({
                        command: 'showErrorMessage',
                        data: {
                            message: '',
                            documentId: shaderDocument.documentId
                        }
                    });

                },
                (error: string) =>
                {
                    if (this.panel) {
                        this.panel.webview.postMessage({
                            command: 'showErrorMessage',
                            data: {
                                message: error,
                                documentId: shaderDocument.documentId
                            }
                        });
                    }
                })
            )).then(() => resolve(), reject);
        });
	}
}

import * as vscode from 'vscode';

import * as path from 'path';

import { GLSLCode } from './GLSLCompiler';
import ObjectMerger from './ObjectMerger';
import ShaderDocument from './ShaderDocument';
import HLSLtoGLSLRecompiler from './HLSLtoGLSLRecompiler';
import ThrottledDelayer from './ThrottledDelayer';
import { ShaderType, RunTrigger } from './Enums';
import { GetWebviewContent } from './WebViewContent';

import * as Utils from './Utils';


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

    private GetNextDocumentIndex(): number
    {
        return this._lastShaderDocumentIndex++;
    }

    constructor(context: vscode.ExtensionContext)
    {
		this.context = context;
		let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.trigger = RunTrigger.from(section.get<string>('preview.trigger', RunTrigger.strings.onType));
            this.delay = section.get<number>('preview.delay', 250);
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
			prompt: "Entry point name: ",
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

			this.panel.webview.html = GetWebviewContent(this.context);

            this.panel.webview.onDidReceiveMessage(((e: any) =>
            {
                switch (e.type)
                {
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
					break;
                    case 'updateUniforms':
                        console.log('updateUniforms', e.data);
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
                        let shaderDocuments = ((e.data instanceof Object) && (e.data.documentIds instanceof Array))
                            ? this.GetShaderDocumentsByIds(e.data.documentIds)
                            : this.documents;

                        let shadersUpdated: boolean = false;

                        Object.keys(shaderDocuments).map(key => this.documents[key]).forEach(
                            (shaderDocument: ShaderDocument) =>
                            {
                                let newEnabledIfdefs = (e.data.ifdefs instanceof Array) ? e.data.ifdefs : [];

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
										//editor.selection = new vscode.Selection(range.start, range.end);
										editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

										let cursor = editor.selection.active;
										let pos = cursor.with(lineNumber - 1, columnNumber - 1);
										editor.selection = new vscode.Selection(pos, pos);
									}
								}
							);
						}
                    break;
                    case 'updateSettings':
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

            this.panel.webview.postMessage({
                command: "loadUniforms",
                data: this.LoadDocumentsUniforms(this.documents)
            });

			this.panel.onDidDispose(
				() => {
					this.panel = undefined;
				},
				null
			);
        }

        this.UpdateShaders(this.documents);

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

    private DoUpdateShaders(): Promise<GLSLCode>
    {
        return new Promise<GLSLCode>((resolve, reject) =>
        {
			let documentsToUpdate = Object.keys(this.documents).map(key => this.documents[key]).filter(doc => doc.needsUpdate && !doc.isBeingUpdated);

			if (documentsToUpdate.length <= 0)
			{
				reject("no documents to update");
				return;
            }

			documentsToUpdate.forEach(
				(shaderDocument: ShaderDocument) =>
				{
                    let compileDocumentVersion = shaderDocument.version;

					shaderDocument.needsUpdate = false;
                    shaderDocument.isBeingUpdated = true;
                    shaderDocument.lastCompiledVersion = compileDocumentVersion;

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

					this.recompiler.HLSL2GLSL(shaderDocument)
                    .then(
                        ((shaderDocument: ShaderDocument, glslCode: GLSLCode) =>
                        {
                            if (this.panel)
                            {
                                this.panel.webview.postMessage({
                                    command: (shaderDocument.shaderType === ShaderType.vertex) ? 'updateVertexShader' : 'updateFragmentShader',
                                    data: {
                                        documentId: shaderDocument.documentId,
                                        code: glslCode.code,
                                        uniforms: this.LoadDocumentsUniformsDesc(this.documents),
                                        textures: this.LoadDocumentsTextures(this.documents)
                                    }
                                });

                                this.panel.webview.postMessage({
                                    command: 'showErrorMessage',
                                    data: ""
                                });
                            }

                            shaderDocument.lastUpdateVersion = compileDocumentVersion;

                            shaderDocument.isBeingUpdated = false;

                            resolve(glslCode);

                            if (shaderDocument.needsUpdate)
                            {
                                this.UpdateShaders();
                            }
                        }
                    ).bind(this, shaderDocument))
                    .catch((
                        (reject:any, reason:any) =>
                        {
                            if (this.panel)
                            {
                                this.panel.webview.postMessage({
                                    command: 'showErrorMessage',
                                    data: reason
                                });
                            }

                            shaderDocument.isBeingUpdated = false;

                            reject(reason);

                            if (shaderDocument.needsUpdate)
                            {
                                this.UpdateShaders();
                            }
                        }
                    ).bind(this, reject));
				}
			);
		});
	}
}


import * as vscode from 'vscode';
import * as path from 'path';

import HLSLtoGLSLRecompiler from './recompiler';
import { GLSLCode } from './glsl';

import { ThrottledDelayer } from './async';

import * as mime from 'mime-types';

import * as fs from 'fs';


function LoadFileBase64(filepath: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(filepath, { encoding: 'base64' }, (err, data) => {
			if (err) { 
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

function LoadFileAsDataUri(filepath: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		LoadFileBase64(filepath)
		.then((data: string) => {
			resolve('data:' + mime.lookup(filepath) + ';base64,' + data);
		})
		.catch(reject);
	});
}

const InternalParameters = [ 'iTime', 'iResolution' ];


function GetIfdefs(text: string): string[] 
{
	let ifdefs:string[] = [];

	let comment_re = /(\"[^\"]*\"(?!\\))|(\/\/[^\n]*$|\/(?!\\)\*[\s\S]*?\*(?!\\)\/)/mg;
	let nocomments = text.replace(comment_re, '');
	
	const re = /^\s*#if(?:def\s+|\s+defined\(\s*)(\w+)\)?\s*$/gm;
	var m;
	while (m = re.exec(nocomments)) {
		let name = m[1];
		if (name === 'VSCODE_HLSL_PREVIEW') {
			continue;
		}
		if (ifdefs.indexOf(name) < 0) {
			ifdefs.push(name);
		}
	}

	return ifdefs;
}

function getMediaPath(context: vscode.ExtensionContext, mediaFile: string): vscode.Uri {
	return vscode.Uri.file(context.asAbsolutePath(path.join('media', mediaFile))).with({ scheme: 'vscode-resource' });//.toString();
}

function getWebviewContent(context: vscode.ExtensionContext): string
{
	return `
	<!DOCTYPE html>
	<html lang="en">
	<html>
		<head>
			<meta charset="UTF-8">
			<title>HLSL preview</title>
			<link rel="stylesheet" type="text/css" href="${getMediaPath(context, 'css/style.css')}">
			<script src="${getMediaPath(context, 'scripts/jquery.min.js')}" language="javascript"></script>
			<script src="${getMediaPath(context, "scripts/three.min.js")}" language="javascript"></script>
			<script src="${getMediaPath(context, "scripts/OrbitControls.js")}" language="javascript"></script>
			<script src="${getMediaPath(context, "scripts/DDSLoader.js")}" language="javascript"></script>
			<script src="${getMediaPath(context, "scripts/TGALoader.js")}" language="javascript"></script>
			<script src="${getMediaPath(context, "scripts/DDSLoader.js")}" language="javascript"></script>
		</head>
		<img id="defaultTexture" src="${getMediaPath(context, "images/uvgrid.jpg")}" hidden="hidden"></img>
		<script id="fragmentShader" type="x-shader/x-fragment">
			varying highp vec2 in_var_TEXCOORD0;
			void main()	{
				gl_FragColor = vec4(0.0);
			}
		</script>
		<script id="vertexShader" type="x-shader/x-vertex">
			varying highp vec2 in_var_TEXCOORD0;
			void main()	{
				in_var_TEXCOORD0 = uv;
				gl_Position = vec4( position, 1.0 );
			}
		</script>
		<script id="vertexShaderMesh" type="x-shader/x-vertex">
			varying highp vec2 in_var_TEXCOORD0;
			void main()	{
				in_var_TEXCOORD0 = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		</script>
		<script id="skyboxPath" type="x-skybox-path/x-path">${getMediaPath(context, "images/skybox")}/</script>
		
		<body>
			<div id="content"></div>
			<div id="errorFrame"></div>
			<script src="${getMediaPath(context, "scripts/main.js")}" language="javascript"></script>
		</body>
	</html>
	`;
}

enum RunTrigger {
    onSave,
    onType
}

namespace RunTrigger {
    'use strict';
    export let strings = {
        onSave: 'onSave',
        onType: 'onType'
    };
    export let from = function (value: string): RunTrigger {
        if (value === 'onSave') {
            return RunTrigger.onSave;
        }
		
		return RunTrigger.onType;
    };
}

class HLSLPreview
{
	private currentPanel: vscode.WebviewPanel | undefined = undefined;

	private currentDocument: vscode.TextDocument | undefined = undefined;

	private triggerSubscribed: boolean = false;

	private context: vscode.ExtensionContext;
	
	private recompiler = new HLSLtoGLSLRecompiler();

	private entryPointName:string = "main";

	private trigger = RunTrigger.onType;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		let section = vscode.workspace.getConfiguration('hlsl');

        if (section) {
			this.trigger = RunTrigger.from(section.get<string>('preview.trigger', RunTrigger.strings.onType));
		}
	}

	public onStartCommand() {
		if (!vscode.window.activeTextEditor){
			console.error('no active text editor');
			return;
		}

		this.currentDocument = vscode.window.activeTextEditor.document;

		let defaultEntryPoint:string = this.context.workspaceState.get('hlsl.preview.entrypoint') || "main";

		let dialogOptions: vscode.InputBoxOptions = {
			prompt: "Entry point name: ",
			placeHolder: 'main',
			value: defaultEntryPoint,
			valueSelection: [0, defaultEntryPoint.length]
		};
		
		vscode.window.showInputBox(dialogOptions).then(value => { 
			if (typeof(value) === 'undefined') { return; }

			if (value === "") {
				value = "main"; 
			} else {
				this.context.workspaceState.update('hlsl.preview.entrypoint', value);
			}

			this.entryPointName = value;
			this.StartPreview();
		});
	}

	public onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		if (this.currentDocument === event.document) {
			this.UpdateShader();
		}
	}

	public StartPreview(): void {
		
		if (!this.currentDocument) {
			return;
		}

		if (!this.triggerSubscribed) {
			if (this.trigger === RunTrigger.onType) {
				vscode.workspace.onDidChangeTextDocument(((event: vscode.TextDocumentChangeEvent) => {
					if (this.currentDocument === event.document) {
						this.UpdateShader();
					}
				}).bind(this));
			} else {
				vscode.workspace.onDidSaveTextDocument(((document: vscode.TextDocument): any => {
					if (this.currentDocument === document) {
						this.UpdateShader();
					}
				}).bind(this));
			}
			this.triggerSubscribed = true;
		}

		const columnToShowIn: vscode.ViewColumn = vscode.ViewColumn.Two;

		if (this.currentPanel) {
			this.currentPanel.reveal(columnToShowIn);
		} else {
			this.currentPanel = vscode.window.createWebviewPanel(
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
			
			this.currentPanel.webview.html = getWebviewContent(this.context);

			this.currentPanel.webview.onDidReceiveMessage(((e: any) => {
				switch (e.type) {
					case 'updateUniforms':
						if (this.currentDocument) {
							let key = 'uniforms_' + this.currentDocument.uri.toString();
							this.context.workspaceState.update(key, e.data);
						}
					break;
					case 'updateEnabledIfdefs':
						if (this.currentDocument) {
							let key = 'ifdefs_' + this.currentDocument.uri.toString();
							let oldEnabledIfdefs = this.context.workspaceState.get<string[]>(key);

							var needUpdateShader = false;
							if (oldEnabledIfdefs && (oldEnabledIfdefs.length === e.data.length)) {
								oldEnabledIfdefs.forEach(ifdef => {
									if (e.data.indexOf(ifdef) < 0) {
										needUpdateShader = true;
									}
								});
							} else {
								needUpdateShader = true;
							}

							if (needUpdateShader) {
								this.context.workspaceState.update(key, e.data);
								this.UpdateShader();
							}
							
							vscode.commands.executeCommand('hlsl.linter.setifdefs', JSON.stringify(e.data));
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
						}).then(((opId: number, uris: vscode.Uri[] | undefined) => {
							if (!uris) {
								console.error('showOpenDialog failed!');
								return;
							}

							let filename = uris[0].fsPath;
							LoadFileAsDataUri(filename).then(((opId:number, dataUri:string) => {
								if (this.currentPanel) {
									this.currentPanel.webview.postMessage({
										command: 'openFile',
										data: {
											filename: filename,
											opId: opId,
											data: dataUri
										}
									});
								}
							}).bind(this, opId));
						}).bind(this, e.data.opId));
					break;						
					case 'loadFile':
						let opId = e.data.opId;
						let filename = e.data.filename;
						LoadFileAsDataUri(filename).then(((opId:number, filename: string, dataUri:string) => {
							if (this.currentPanel) {
								this.currentPanel.webview.postMessage({
									command: 'loadFile',
									data: {
										filename: filename,
										opId: opId,
										data: dataUri
									}
								});
							}
						}).bind(this, opId, filename));
					break;
					case 'goto':
						let lineNumber = parseInt(e.data.line);
						let columnNumber = parseInt(e.data.column);
						if (this.currentDocument) {
							vscode.window.visibleTextEditors.forEach(editor => {
								if (editor.document === this.currentDocument) {
									let range = editor.document.lineAt(lineNumber-1).range;
									//editor.selection = new vscode.Selection(range.start, range.end);
									editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
									
									let cursor = editor.selection.active;
									let pos = cursor.with(lineNumber - 1, columnNumber - 1);
									editor.selection = new vscode.Selection(pos, pos);
								}
							});
						}
					break;
				}
			  }).bind(this));


			  let key = 'uniforms_' + this.currentDocument.uri.toString();
			  let cachedUniforms = this.context.workspaceState.get(key);
			  if (cachedUniforms) {
				this.currentPanel.webview.postMessage({
					command: "loadUniforms",
					data: cachedUniforms
				});
			}

			  
			// Reset when the current panel is closed
			this.currentPanel.onDidDispose(
				() => {
					this.currentPanel = undefined;
				},
				null
			);

		}

		this.UpdateShader();
	}

	private getUniforms(code: GLSLCode): { [key:string]: any }
	{
		let uniforms: { [key:string]: any } = {};

		if ('types' in code.reflection) {
			Object.keys(code.reflection['types']).forEach((key) => {
				let structName:string = code.reflection['types'][key]['name'];
				structName = structName.replace(/^type_/, '');
				Object.keys(code.reflection['types'][key]['members']).forEach((memberKey) => {
					
					let member:{[key:string]:any} = code.reflection['types'][key]['members'][memberKey];
					let name = member['name'];
					let type = member['type'];

					if (structName === '_Globals' && (InternalParameters.indexOf(name) >= 0)) {
						return;
					}

					if (!(structName in uniforms)) {
						uniforms[structName] = { };
					}
					uniforms[structName][name] = type;
				});
			});
		}
	
		return uniforms;
	}

	private getTextures(code: GLSLCode): { [key:string]: string }
	{
		let result: { [key:string]: string } = {};

		if ('separate_images' in code.reflection) {
			code.reflection['separate_images'].forEach((tex: { [key:string]: any }) => {
				result[tex['name']] = tex['type'];
			});
		}

		return result;
	}

	public UpdateShader(): void {
		new ThrottledDelayer<GLSLCode>(100).trigger(() => this.DoUpdateShader()
		.catch(err => {
			return new GLSLCode("", {});
		}));
	}

	private DoUpdateShader(): Promise<GLSLCode> {

		return new Promise<GLSLCode>((resolve, reject) => {

			if (!this.currentDocument) {
				reject("no current document");
				return;
			}

			let ifdefs = GetIfdefs(this.currentDocument.getText());
			let enabledIfdefs:string[] = [];
			if (ifdefs.length > 0) {
				let key = 'ifdefs_' + this.currentDocument.uri.toString();
				let savedEnabledIfdefs = this.context.workspaceState.get<string[]>(key);
				if (savedEnabledIfdefs) {
					savedEnabledIfdefs.forEach(ifdef => {
						if (ifdefs.indexOf(ifdef) >= 0) {
							enabledIfdefs.push(ifdef);
						}
					});
					this.context.workspaceState.update(key, enabledIfdefs);
				}
			}

			if (this.currentPanel) {				
				this.currentPanel.webview.postMessage({
					command: 'updateIfdefs',
					data: {
						ifdefs: ifdefs,
						enabledIfdefs: enabledIfdefs
					}
				});
			}
			
			
			this.recompiler.HLSL2GLSL(this.currentDocument, this.entryPointName, enabledIfdefs)
			.then((glslCode) => {
				if (this.currentPanel) {				
					this.currentPanel.webview.postMessage({
						command: 'updateFragmentShader',
						data: {
							code: glslCode.code,
							uniforms: this.getUniforms(glslCode),
							textures: this.getTextures(glslCode)
						}
					});
					this.currentPanel.webview.postMessage({
						command: 'showErrorMessage',
						data: ""
					});
				}			
				resolve(glslCode);
			})
			.catch(((reject:any, reason:any) => {
				if (this.currentPanel) {
					this.currentPanel.webview.postMessage({
						command: 'showErrorMessage',
						data: reason
					});
				}
				reject(reason);
			}).bind(this, reject));	
		});

	}
	

}

export function activate(context: vscode.ExtensionContext) {
	let preview = new HLSLPreview(context);
		
	vscode.commands.registerCommand(
		'hlsl.preview.start', 
		preview.onStartCommand.bind(preview)
	);
}

export function deactivate() {}

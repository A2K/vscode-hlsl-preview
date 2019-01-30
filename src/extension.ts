
import * as vscode from 'vscode';
import * as path from 'path';

import HLSLtoGLSLRecompiler from './recompiler';
import { GLSLCode } from './glsl';

import { ThrottledDelayer } from './async';


const InternalParameters = [ 'iTime', 'iResolution' ];

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
		</head>
		<img id="defaultTexture" src="${getMediaPath(context, "images/uvgrid.jpg")}" hidden="hidden"></img>
		<script id="fragmentShader" type="x-shader/x-fragment">
			varying highp vec2 in_var_TEXCOORD0;
			void main()	{
				gl_FragColor = vec4(0.0);
			}
		</script>
		<script id="vertexShader" type="x-shader/x-vertex">
			uniform float time;
			uniform vec2 resolution;
			varying highp vec2 in_var_TEXCOORD0;
			void main()	{
				in_var_TEXCOORD0 = uv;
				gl_Position = vec4( position, 1.0 );
			}
		</script>
		<body>
			<div id="content"></div>
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

			this.currentPanel.webview.onDidReceiveMessage(e => {
				switch (e.type) {
				  case 'updateUniforms':
					if (this.currentDocument) {					  
						let key = 'uniforms_' + this.currentDocument.uri.toString();
						this.context.workspaceState.update(key, e.data);
					}
				  break;
				}
			  });


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
		new ThrottledDelayer<GLSLCode>(100).trigger(() => this.DoUpdateShader());
	}

	private DoUpdateShader(): Promise<GLSLCode> {

		return new Promise<GLSLCode>((resolve, reject) => {

			if (!this.currentDocument) {
				reject("no current document");
				return;
			}
			
			this.recompiler.HLSL2GLSL(this.currentDocument, this.entryPointName).then((glslCode) => {
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
			}).catch((reason) => {
				if (this.currentPanel) {
					this.currentPanel.webview.postMessage({
						command: 'showErrorMessage',
						data: reason
					});
				}
				reject(reason);
			});	
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

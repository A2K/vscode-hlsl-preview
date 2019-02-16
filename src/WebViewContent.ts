import * as vscode from 'vscode';

import * as path from 'path';


export function GetMediaPath(context: vscode.ExtensionContext, mediaFile: string): vscode.Uri
{
	return vscode.Uri.file(context.asAbsolutePath(path.join('media', mediaFile))).with({ scheme: 'vscode-resource' });
}

function getWASMIncludes(context: vscode.ExtensionContext, useBinaryDXC: boolean, useWASMWebServer: boolean, wasmWebServerPort: number): string
{
	if (useBinaryDXC)
	{
		return '<script language="javascript">WASMCompiler = false</script>';
	}

	if (useWASMWebServer)
	{
		return `<script src="http://127.0.0.1:${wasmWebServerPort}/wasm/spirv.js" language="javascript"></script>
				<script src="http://127.0.0.1:${wasmWebServerPort}/wasm/dxcompiler.js" language="javascript"></script>
				<script src="http://127.0.0.1:${wasmWebServerPort}/wasm/wasmcompiler.js" language="javascript"></script>`;
	}
	else
	{
		return `<script src="${GetMediaPath(context, 'wasm/spirv.js')}" language="javascript"></script>
				<script src="${GetMediaPath(context, 'wasm/dxcompiler.js')}" language="javascript"></script>
				<script src="${GetMediaPath(context, "wasm/wasmcompiler.js")}" language="javascript"></script>`;
	}


}

export function GetWebviewContent(context: vscode.ExtensionContext, useBinaryDXC: boolean, useWASMWebServer: boolean, wasmWebServerPort: number): string
{
	return `
	<!DOCTYPE html>
	<html lang="en">
	<html>
		<head>
			<meta charset="UTF-8">
			<title>HLSL preview</title>
			<link rel="stylesheet" type="text/css" href="${GetMediaPath(context, 'css/style.css')}"></link>
			<script src="${GetMediaPath(context, 'scripts/jquery.min.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/three.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/OrbitControls.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/DDSLoader.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/TGALoader.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/FBXLoader.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, 'scripts/base64.js')}" language="javascript"></script>
			` + getWASMIncludes(context, useBinaryDXC, useWASMWebServer, wasmWebServerPort) + `
		</head>
		<img id="defaultTexture" src="${GetMediaPath(context, 'images/uvgrid.jpg')}" hidden="hidden"></img>
		<script id="fragmentShader" type="x-shader/x-fragment">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				gl_FragColor = vec4(0.0);
			}
		</script>
		<script id="vertexShader" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = vec2(uv.x, 1.0 - uv.y);
				gl_Position = vec4( position, 1.0 );
			}
		</script>
		<script id="vertexShaderMesh" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		</script>

		<script id="skyboxPath" type="x-skybox-path/x-path">${GetMediaPath(context, 'images/skybox')}/</script>

		<body>
			<div id="content"></div>
			<div id="errorFrame"></div>
			<script src="${GetMediaPath(context, 'scripts/main.js')}" language="javascript"></script>
		</body>
	</html>
	`;
}
